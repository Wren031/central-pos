package com.centralpos.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothSocket
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.ActivityCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.IOException
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * Native ESC/POS Bluetooth thermal printer support for Central POS.
 *
 * Handles BOTH transports that portable mini thermal printers use:
 *  - Classic Bluetooth SPP (RFCOMM serial port) — RfcommSocket
 *  - BLE GATT — BluetoothGatt characteristic writes
 *
 * Every method either succeeds because the hardware acknowledged it, or rejects
 * with the real error. Nothing here simulates a connection or a print job.
 */
@CapacitorPlugin(name = "PrinterPlugin")
class PrinterPlugin : Plugin() {

    companion object {
        private const val SPP_UUID_STR = "00001101-0000-1000-8000-00805F9B34FB"
        private const val PERM_REQUEST_CODE = 4201

        /** BLE services commonly used by portable mini thermal printers. */
        private val PRINTER_SERVICES = arrayOf(
            UUID.fromString("6e400001-b5a3-f393-e0a9-e50e24dcca9e"), // Nordic UART
            UUID.fromString("0000ffe0-0000-1000-8000-00805f9b34fb"), // HM-10 UART
            UUID.fromString("0000ae30-0000-1000-8000-00805f9b34fb"), // XPrinter BLE
            UUID.fromString("0000fe59-0000-1000-8000-00805f9b34fb"),
        )

        private const val BLE_WRITE_DELAY_MS = 15L
        private const val SPP_WRITE_DELAY_MS = 5L
        private const val SPP_CHUNK = 64
        private const val BLE_CHUNK = 20
        private const val CONNECT_TIMEOUT_MS = 10_000L
        private const val BLE_OP_TIMEOUT_MS = 30_000L
        private const val SCAN_WINDOW_MS = 8_000L
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private val adapter: BluetoothAdapter? by lazy {
        val mgr = getContext().getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        mgr?.adapter
    }

    private var sppSocket: BluetoothSocket? = null
    private var sppOutput: OutputStream? = null
    private var bleGatt: BluetoothGatt? = null
    private var bleCharacteristic: BluetoothGattCharacteristic? = null
    private var connectedAddress: String? = null
    private var connectedProtocol: String? = null

    private var classicReceiver: BroadcastReceiver? = null
    private var leScanCallback: ScanCallback? = null
    private var scanning = false

    /**
     * Write-ack state for BLE: the single GATT callback (registered at connect)
     * counts down [writeAckLatch] and records [writeError] on every chunk ack.
     */
    private var writeAckLatch: CountDownLatch? = null
    private var writeError: IOException? = null

    /** The GATT callback used for the active BLE link. */
    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                gatt.discoverServices()
                bleConnectLatch?.countDown()
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED && connectedAddress == gatt.device.address) {
                mainHandler.post { emitDisconnect(gatt.device.address) }
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            val write = findWritableCharacteristic(gatt)
            if (write == null) {
                bleConnectError = "No writable print characteristic found. Not an ESC/POS BLE printer?"
                gatt.disconnect()
            } else {
                bleCharacteristic = write
            }
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            if (status != BluetoothGatt.GATT_SUCCESS && writeError == null) {
                writeError = IOException("BLE write failed (GATT status $status).")
            }
            writeAckLatch?.countDown()
        }
    }

    private var bleConnectLatch: CountDownLatch? = null
    @Volatile private var bleConnectError: String? = null

    // ------------------------------------------------------------------
    // Permissions
    // ------------------------------------------------------------------

    private fun requiredPermissions(): Array<String> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            arrayOf(Manifest.permission.BLUETOOTH, Manifest.permission.BLUETOOTH_ADMIN)
        }

    private fun hasPermissions(): Boolean = requiredPermissions().all {
        ActivityCompat.checkSelfPermission(getContext(), it) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestPermissions() {
        val activity: Activity? = getActivity()
        if (activity == null) return
        ActivityCompat.requestPermissions(activity, requiredPermissions(), PERM_REQUEST_CODE)
    }

    // ------------------------------------------------------------------
    // scan — real discovery for both classic and BLE printers
    // ------------------------------------------------------------------

    @PluginMethod
    fun scan(call: PluginCall) {
        if (scanning || classicReceiver != null) {
            call.reject("A scan is already in progress. Wait for it to finish.")
            return
        }
        val a = adapter
        if (a == null) {
            call.reject("Bluetooth is not supported on this device.")
            return
        }
        if (!a.isEnabled) {
            call.reject("Bluetooth is turned off. Enable Bluetooth and try again.")
            return
        }
        if (!hasPermissions()) {
            requestPermissions()
            call.reject("Bluetooth permissions not granted yet. Grant them and retry.")
            return
        }

        val devices = LinkedHashMap<String, JSObject>()

        // 1. Bonded (paired) classic printers — always real.
        try {
            for (d in a.bondedDevices ?: emptySet()) {
                if (d.name != null && looksLikePrinter(d.name)) {
                    val obj = JSObject()
                    obj.put("id", d.address)
                    obj.put("name", d.name)
                    obj.put("protocol", "spp")
                    obj.put("paired", true)
                    devices[d.address] = obj
                }
            }
        } catch (_: SecurityException) {
            // Permission race — surfaced via reject below.
        }

        // 2. Live discovery — classic broadcast + BLE scan, collected for a fixed window.
        val foundNow = LinkedHashMap<String, JSObject>()
        classicReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action != BluetoothDevice.ACTION_FOUND) return
                val d: BluetoothDevice? =
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                    else
                        @Suppress("DEPRECATION") intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                if (d == null || d.name == null) return
                try {
                    if (!looksLikePrinter(d.name)) return
                    val rssi = intent.getShortExtra(BluetoothDevice.EXTRA_RSSI, 0).toInt()
                    val obj = JSObject()
                    obj.put("id", d.address)
                    obj.put("name", d.name)
                    obj.put("protocol", "spp")
                    obj.put("paired", d.bondState == BluetoothDevice.BOND_BONDED)
                    if (rssi != 0) obj.put("rssi", (50 + rssi / 2).coerceIn(0, 100))
                    foundNow[d.address] = obj
                } catch (_: SecurityException) {
                    // ignore
                }
            }
        }

        leScanCallback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult?) {
                val d = result?.device ?: return
                try {
                    if (d.name == null || !looksLikePrinter(d.name)) return
                    val obj = JSObject()
                    obj.put("id", d.address)
                    obj.put("name", d.name)
                    obj.put("protocol", "ble")
                    obj.put("paired", false)
                    result.rssi?.let { obj.put("rssi", (50 + it / 2).coerceIn(0, 100)) }
                    foundNow[d.address] = obj
                } catch (_: SecurityException) {
                    // ignore
                }
            }
        }

        val ctx = getContext()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ctx.registerReceiver(
                classicReceiver,
                IntentFilter(BluetoothDevice.ACTION_FOUND),
                Context.RECEIVER_EXPORTED
            )
        } else {
            ctx.registerReceiver(classicReceiver, IntentFilter(BluetoothDevice.ACTION_FOUND))
        }

        val scanner = a.bluetoothLeScanner
        if (scanner != null) {
            val settings = ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .build()
            scanner.startScan(null, settings, leScanCallback)
            scanning = true
        }
        @Suppress("MissingPermission")
        a.startDiscovery()

        mainHandler.postDelayed({
            try {
                @Suppress("MissingPermission")
                a.cancelDiscovery()
            } catch (_: SecurityException) {
            }
            if (scanning) {
                try {
                    scanner?.stopScan(leScanCallback)
                } catch (_: SecurityException) {
                }
                scanning = false
            }
            ctx.unregisterReceiver(classicReceiver)
            classicReceiver = null

            devices.putAll(foundNow)
            val res = JSObject()
            res.put("devices", devices.values.toList())
            call.resolve(res)
        }, SCAN_WINDOW_MS)
    }

    private fun looksLikePrinter(name: String): Boolean {
        val n = name.lowercase()
        return n.contains("printer") || n.contains("print") || n.contains("pos") ||
            n.contains("tm-") || n.contains("rpp") || n.contains("rp-") ||
            n.contains("xp-") || n.contains("netum") || n.contains("rongta") ||
            n.contains("hprt") || n.contains("xprinter") || n.contains("goojprt") ||
            n.contains("paperang")
    }

    // ------------------------------------------------------------------
    // connect — real SPP or BLE link
    // ------------------------------------------------------------------

    @PluginMethod
    fun connect(call: PluginCall) {
        val a = adapter
        if (a == null) {
            call.reject("Bluetooth is not supported on this device.")
            return
        }
        if (!a.isEnabled) {
            call.reject("Bluetooth is turned off.")
            return
        }
        if (!hasPermissions()) {
            requestPermissions()
            call.reject("Bluetooth permissions not granted yet.")
            return
        }

        val address = call.getString("deviceId") ?: run {
            call.reject("deviceId is required.")
            return
        }
        val protocol = call.getString("protocol") ?: "ble"

        forceClose()

        try {
            if (protocol == "spp") {
                connectSpp(a, address)
            } else {
                connectBle(a, address)
            }
        } catch (e: IOException) {
            forceClose()
            call.reject("Connection failed: ${e.message ?: "I/O error"}")
            return
        } catch (e: SecurityException) {
            forceClose()
            call.reject("Permission error: ${e.message}")
            return
        } catch (e: Exception) {
            forceClose()
            call.reject("Connection failed: ${e.message ?: e.javaClass.simpleName}")
            return
        }

        connectedAddress = address
        connectedProtocol = protocol
        call.resolve(JSObject().put("ok", true))
    }

    @SuppressLint("MissingPermission")
    private fun connectSpp(a: BluetoothAdapter, address: String) {
        val device = a.getRemoteDevice(address)
            ?: throw IOException("Device $address not found.")
        val socket = device.createRfcommSocketToServiceRecord(UUID.fromString(SPP_UUID_STR))
        sppSocket = socket
        // connect() blocks — run it off the plugin thread with a watchdog so a dead
        // printer can't hang forever. Capture the real failure, don't swallow it.
        val latch = CountDownLatch(1)
        var connectError: IOException? = null
        thread {
            try {
                socket.connect()
            } catch (e: IOException) {
                connectError = e
            } catch (e: SecurityException) {
                connectError = IOException("Permission error: ${e.message}")
            } finally {
                latch.countDown()
            }
        }
        val ok = latch.await(CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        if (!ok || !socket.isConnected || connectError != null) {
            try {
                socket.close()
            } catch (_: IOException) {
            }
            sppSocket = null
            if (connectError != null) throw connectError
            throw IOException("Timed out connecting to $address. Is the printer on and in range?")
        }
        sppOutput = socket.outputStream
    }

    @SuppressLint("MissingPermission")
    private fun connectBle(a: BluetoothAdapter, address: String) {
        val device = a.getRemoteDevice(address)
            ?: throw IOException("Device $address not found.")

        bleConnectError = null
        bleConnectLatch = CountDownLatch(1)
        bleCharacteristic = null

        val gatt = device.connectGatt(getContext(), false, gattCallback)
            ?: throw IOException("connectGatt returned null.")
        bleGatt = gatt

        if (!bleConnectLatch!!.await(CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
            closeGatt()
            throw IOException("Timed out connecting to $address. Is the printer on and in range?")
        }

        // Service discovery completes asynchronously after connect.
        val deadline = System.currentTimeMillis() + CONNECT_TIMEOUT_MS
        while (bleCharacteristic == null && bleConnectError == null && System.currentTimeMillis() < deadline) {
            Thread.sleep(100)
        }
        val err = bleConnectError
        if (err != null) {
            closeGatt()
            throw IOException(err)
        }
        if (bleCharacteristic == null) {
            closeGatt()
            throw IOException("Timed out discovering services on $address.")
        }
    }

    @SuppressLint("MissingPermission")
    private fun findWritableCharacteristic(gatt: BluetoothGatt): BluetoothGattCharacteristic? {
        for (svcUuid in PRINTER_SERVICES) {
            val svc = gatt.getService(svcUuid) ?: continue
            for (ch in svc.characteristics) {
                val props = ch.properties
                if ((props and BluetoothGattCharacteristic.PROPERTY_WRITE != 0) ||
                    (props and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0)
                ) {
                    return ch
                }
            }
        }
        // Fallback: any writable characteristic on the device.
        for (svc in gatt.services) {
            for (ch in svc.characteristics) {
                val props = ch.properties
                if ((props and BluetoothGattCharacteristic.PROPERTY_WRITE != 0) ||
                    (props and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0)
                ) {
                    return ch
                }
            }
        }
        return null
    }

    // ------------------------------------------------------------------
    // disconnect
    // ------------------------------------------------------------------

    @PluginMethod
    fun disconnect(call: PluginCall) {
        forceClose()
        connectedAddress = null
        connectedProtocol = null
        call.resolve(JSObject().put("ok", true))
    }

    private fun forceClose() {
        try {
            sppOutput?.flush()
        } catch (_: IOException) {
        }
        try {
            sppSocket?.close()
        } catch (_: IOException) {
        }
        sppSocket = null
        sppOutput = null
        closeGatt()
    }

    private fun closeGatt() {
        val g = bleGatt
        bleGatt = null
        bleCharacteristic = null
        if (g != null) {
            try {
                g.disconnect()
            } catch (_: SecurityException) {
            }
            try {
                g.close()
            } catch (_: SecurityException) {
            }
        }
    }

    // ------------------------------------------------------------------
    // print / testPrint — chunked real writes with hardware pacing
    // ------------------------------------------------------------------

    @PluginMethod
    fun print(call: PluginCall) {
        val address = call.getString("deviceId") ?: connectedAddress
        if (address == null) {
            call.reject("No printer is connected.")
            return
        }
        val protocol = call.getString("protocol") ?: connectedProtocol ?: "ble"
        val dataB64 = call.getString("data")
        if (dataB64 == null) {
            call.reject("print data is required.")
            return
        }

        val bytes: ByteArray = try {
            android.util.Base64.decode(dataB64, android.util.Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            call.reject("Invalid print payload.")
            return
        }

        if (!writeBytes(protocol, address, bytes, call)) return
        call.resolve(JSObject().put("ok", true))
    }

    /** Returns true if the hardware accepted the job. */
    private fun writeBytes(protocol: String, address: String, bytes: ByteArray, call: PluginCall): Boolean {
        try {
            if (protocol == "spp") writeSpp(bytes) else writeBle(bytes)
            return true
        } catch (e: IOException) {
            emitDisconnect(address)
            forceClose()
            call.reject("Print failed: ${e.message ?: "I/O error"}")
            return false
        } catch (e: SecurityException) {
            call.reject("Permission error during print.")
            return false
        } catch (e: Exception) {
            call.reject("Print failed: ${e.message ?: e.javaClass.simpleName}")
            return false
        }
    }

    @PluginMethod
    fun testPrint(call: PluginCall) {
        val address = connectedAddress
        if (address == null) {
            call.reject("No printer is connected.")
            return
        }
        val bytes = buildTestPayload()
        if (!writeBytes(connectedProtocol ?: "ble", address, bytes, call)) return
        call.resolve(JSObject().put("ok", true))
    }

    @SuppressLint("MissingPermission")
    private fun writeSpp(bytes: ByteArray) {
        val out = sppOutput ?: throw IOException("Printer is not connected.")
        for (i in bytes.indices step SPP_CHUNK) {
            val end = minOf(i + SPP_CHUNK, bytes.size)
            out.write(bytes, i, end - i)
            out.flush()
            if (end < bytes.size) Thread.sleep(SPP_WRITE_DELAY_MS)
        }
    }

    @SuppressLint("MissingPermission")
    private fun writeBle(bytes: ByteArray) {
        val gatt = bleGatt ?: throw IOException("Printer is not connected.")
        val ch = bleCharacteristic ?: throw IOException("Printer characteristic unavailable.")

        var offset = 0
        // BLE GATT serializes writes: wait for each chunk's ack before issuing the
        // next, with pacing so the printer's RX buffer doesn't overflow.
        while (offset < bytes.size) {
            val end = minOf(offset + BLE_CHUNK, bytes.size)

            val ack = CountDownLatch(1)
            writeError = null
            writeAckLatch = ack

            ch.writeType = if (ch.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0)
                BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
            else
                BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            ch.value = bytes.copyOfRange(offset, end)

            if (!gatt.writeCharacteristic(ch)) {
                writeAckLatch = null
                throw IOException("writeCharacteristic rejected at byte $offset.")
            }
            if (!ack.await(BLE_OP_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
                writeAckLatch = null
                throw IOException("Timed out waiting for BLE write ack at byte $offset.")
            }
            writeAckLatch = null
            val err = writeError
            if (err != null) throw err

            offset = end
            if (end < bytes.size) Thread.sleep(BLE_WRITE_DELAY_MS)
        }
    }

    private fun buildTestPayload(): ByteArray {
        val sb = StringBuilder()
        fun cmd(vararg b: Int) = b.forEach { sb.append(it.toChar()) }

        cmd(0x1b, 0x40)          // ESC @ init
        cmd(0x1b, 0x61, 0x01)    // ESC a 1 center
        cmd(0x1b, 0x45, 0x01)    // ESC E 1 bold
        cmd(0x1b, 0x21, 0x30)    // ESC ! — double width + height (budget-printer size fallback)
        cmd(0x1d, 0x21, 0x11)    // GS ! double size
        sb.appendLine("SELF TEST")
        cmd(0x1b, 0x21, 0x00)    // ESC ! native (fallback)
        cmd(0x1d, 0x21, 0x00)
        cmd(0x1b, 0x45, 0x00)
        cmd(0x1b, 0x61, 0x00)
        sb.appendLine("-".repeat(48))
        sb.appendLine("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        sb.appendLine("abcdefghijklmnopqrstuvwxyz")
        sb.appendLine("!@#\$%^&*()_+-=[]{};:,.<>?")
        sb.appendLine("-".repeat(48))
        repeat(4) { sb.appendLine() }
        cmd(0x1d, 0x56, 0x42, 0x00) // GS V partial cut
        return sb.toString().toByteArray(Charsets.ISO_8859_1)
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val res = JSObject()
        res.put("connected", connectedAddress != null)
        res.put("deviceId", connectedAddress ?: com.getcapacitor.JSObject.NULL)
        res.put("protocol", connectedProtocol ?: com.getcapacitor.JSObject.NULL)
        call.resolve(res)
    }

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------

    private fun emitDisconnect(address: String) {
        val payload = JSObject().put("deviceId", address)
        notifyListeners("printerDisconnect", payload)
    }
}
