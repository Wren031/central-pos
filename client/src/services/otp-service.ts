import { latency } from '@/database/repos/helpers'

/** Mock OTP lifetime in milliseconds. */
export const OTP_TTL_MS = 5 * 60 * 1000

interface OtpEntry {
  code: string
  expiresAt: number
}

const otps = new Map<string, OtpEntry>()

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function normalize(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Mock "sends" a 6-digit verification code to the given email.
 * Returns the code so the UI can display it in mock mode.
 */
export async function sendOtp(email: string): Promise<{ code: string; expiresAt: number }> {
  await latency()
  const key = normalize(email)
  const entry: OtpEntry = { code: generateCode(), expiresAt: Date.now() + OTP_TTL_MS }
  otps.set(key, entry)
  return { ...entry }
}

/** Generates and stores a fresh code for the email. */
export async function resendOtp(email: string): Promise<{ code: string; expiresAt: number }> {
  return sendOtp(email)
}

/** Checks the code against the latest one issued for the email. */
export async function verifyOtp(email: string, code: string): Promise<void> {
  await latency()
  const key = normalize(email)
  const entry = otps.get(key)
  if (!entry) throw new Error('No verification code requested — resend a new code.')
  if (Date.now() > entry.expiresAt) {
    otps.delete(key)
    throw new Error('Code expired — request a new one.')
  }
  if (entry.code !== code.trim()) throw new Error('Invalid verification code. Try again.')
  otps.delete(key)
}
