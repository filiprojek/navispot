"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import {
  Music,
  Key,
  Globe,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  X,
  ShieldCheck,
  Check,
  Copy,
  RefreshCw,
} from "lucide-react"

interface AppleMusicCredentialsModalProps {
  isOpen: boolean
  onClose: () => void
}

const COMMON_STOREFRONTS = [
  { code: "us", name: "United States (US)" },
  { code: "gb", name: "United Kingdom (GB)" },
  { code: "de", name: "Germany (DE)" },
  { code: "fr", name: "France (FR)" },
  { code: "ca", name: "Canada (CA)" },
  { code: "au", name: "Australia (AU)" },
  { code: "jp", name: "Japan (JP)" },
]

export function AppleMusicCredentialsModal({
  isOpen,
  onClose,
}: AppleMusicCredentialsModalProps) {
  const {
    appleMusic,
    connectAppleMusicWithTokens,
    disconnectAppleMusic,
  } = useAuth()

  const [activeTab, setActiveTab] = useState<"web-token" | "musickit">("web-token")
  const [developerToken, setDeveloperToken] = useState("")
  const [musicUserToken, setMusicUserToken] = useState("")
  const [storefront, setStorefront] = useState("us")

  const [serverDevToken, setServerDevToken] = useState<string | null>(null)
  const [serverStatus, setServerStatus] = useState<"loading" | "available" | "unavailable">("loading")

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [copiedHeader, setCopiedHeader] = useState<string | null>(null)

  // Check server developer token availability on open
  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    setFeedback(null)
    setDeveloperToken(appleMusic.developerToken || "")
    setMusicUserToken(appleMusic.musicUserToken || "")
    setStorefront(appleMusic.storefront || "us")

    async function checkServerDevToken() {
      setServerStatus("loading")
      try {
        const res = await fetch("/api/apple-music/developer-token")
        if (!cancelled) {
          if (res.ok) {
            const data = await res.json()
            if (data.developerToken) {
              setServerDevToken(data.developerToken)
              setServerStatus("available")
              if (!appleMusic.developerToken) {
                setDeveloperToken(data.developerToken)
              }
              return
            }
          }
          setServerStatus("unavailable")
        }
      } catch {
        if (!cancelled) {
          setServerStatus("unavailable")
        }
      }
    }

    checkServerDevToken()

    return () => {
      cancelled = true
    }
  }, [isOpen, appleMusic])

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopiedHeader(label)
    setTimeout(() => setCopiedHeader(null), 2000)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setFeedback(null)

    const finalDevToken = developerToken.trim() || serverDevToken || ""
    const finalUserToken = musicUserToken.trim()

    if (!finalUserToken) {
      setFeedback({
        type: "error",
        message: "Media-User-Token is required to connect your Apple Music library.",
      })
      setIsSubmitting(false)
      return
    }

    if (!finalDevToken) {
      setFeedback({
        type: "error",
        message: "Developer Token is required. Paste a Bearer token or configure server credentials.",
      })
      setIsSubmitting(false)
      return
    }

    try {
      const success = await connectAppleMusicWithTokens({
        developerToken: finalDevToken,
        musicUserToken: finalUserToken,
        storefront: storefront.trim().toLowerCase() || "us",
      })

      if (success) {
        setFeedback({
          type: "success",
          message: "Connected to Apple Music successfully!",
        })
        setTimeout(() => {
          onClose()
        }, 1200)
      } else {
        setFeedback({
          type: "error",
          message: appleMusic.error || "Connection failed. Please verify your tokens and storefront.",
        })
      }
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to connect to Apple Music",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDisconnect = () => {
    disconnectAppleMusic()
    setDeveloperToken("")
    setMusicUserToken("")
    setFeedback({
      type: "success",
      message: "Apple Music account disconnected.",
    })
    setTimeout(() => {
      onClose()
    }, 1000)
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="apple-music-modal-title"
    >
      <div className="w-full max-w-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="apple-music-modal-title"
                className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
              >
                Apple Music Authentication
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Connect your Apple Music library to sync playlists and tracks
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close credentials modal"
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-zinc-100 dark:border-zinc-800 px-6 bg-zinc-50/50 dark:bg-zinc-800/30">
          <button
            type="button"
            onClick={() => setActiveTab("web-token")}
            className={`py-3 px-4 text-xs font-medium border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "web-token"
                ? "border-rose-600 text-rose-600 dark:text-rose-400"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            }`}
          >
            <Key className="w-4 h-4" />
            <span>Web Session Token</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
              Free
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("musickit")}
            className={`py-3 px-4 text-xs font-medium border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "musickit"
                ? "border-rose-600 text-rose-600 dark:text-rose-400"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Developer Mode</span>
            {serverStatus === "available" && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {feedback && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                feedback.type === "success"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300"
                  : "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300"
              }`}
            >
              {feedback.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {activeTab === "web-token" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Instructions */}
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 text-xs text-zinc-600 dark:text-zinc-400 space-y-2">
                <div className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>How to obtain Apple Music Web Tokens:</span>
                </div>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>
                    Open{" "}
                    <a
                      href="https://music.apple.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center gap-0.5"
                    >
                      music.apple.com
                      <ExternalLink className="w-3 h-3" />
                    </a>{" "}
                    and sign in to your subscription.
                  </li>
                  <li>Press F12 to open DevTools and select the Network tab.</li>
                  <li>
                    Filter by <code className="text-zinc-800 dark:text-zinc-200">amp-api</code> and inspect any request header.
                  </li>
                  <li>
                    Copy <code className="text-zinc-800 dark:text-zinc-200">media-user-token</code> and paste below.
                  </li>
                </ol>
              </div>

              {/* Media-User-Token */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="media-user-token"
                    className="text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                  >
                    Media-User-Token
                  </label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard("media-user-token", "mut")}
                    className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 flex items-center gap-1"
                  >
                    {copiedHeader === "mut" ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-500" />
                        <span>Copied name</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy header name</span>
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  id="media-user-token"
                  rows={2}
                  required
                  placeholder="Paste Media-User-Token here..."
                  value={musicUserToken}
                  onChange={(e) => setMusicUserToken(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              {/* Developer Token */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="developer-token"
                    className="text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                  >
                    Developer Token (Authorization: Bearer ...)
                  </label>
                  {serverStatus === "available" && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" />
                      Server token active
                    </span>
                  )}
                </div>
                <textarea
                  id="developer-token"
                  rows={2}
                  placeholder={
                    serverStatus === "available"
                      ? "Server developer token configured (leave empty to use server token)"
                      : "Paste Bearer developer token..."
                  }
                  value={developerToken}
                  onChange={(e) => setDeveloperToken(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-zinc-900 dark:text-zinc-100"
                />
                {serverStatus === "available" && !developerToken && (
                  <p className="text-[11px] text-zinc-500">
                    The backend has Apple Developer credentials configured. You can leave this blank.
                  </p>
                )}
              </div>

              {/* Storefront */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="storefront-select"
                    className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Storefront
                  </label>
                  <select
                    id="storefront-select"
                    value={storefront}
                    onChange={(e) => setStorefront(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-zinc-900 dark:text-zinc-100"
                  >
                    {COMMON_STOREFRONTS.map((sf) => (
                      <option key={sf.code} value={sf.code}>
                        {sf.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="custom-storefront"
                    className="text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                  >
                    Custom Storefront Code
                  </label>
                  <input
                    id="custom-storefront"
                    type="text"
                    maxLength={5}
                    placeholder="e.g. us, gb, de"
                    value={storefront}
                    onChange={(e) => setStorefront(e.target.value.toLowerCase())}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-zinc-900 dark:text-zinc-100 uppercase"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-zinc-100 dark:border-zinc-800">
                {appleMusic.isAuthenticated ? (
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="px-3.5 py-2 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                  >
                    Disconnect
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <span>Save & Connect</span>
                    )}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-850 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      Apple Music Server Credentials
                    </span>
                  </div>
                  {serverStatus === "available" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800">
                      <CheckCircle2 className="w-3 h-3" />
                      Configured
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700">
                      Not Configured
                    </span>
                  )}
                </div>

                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  When Apple Developer credentials are set in your environment variables, NaviSpot
                  automatically issues and rotates signed ES256 JWT developer tokens with up to 180 days validity.
                </p>

                <div className="p-3 bg-zinc-100 dark:bg-zinc-900 rounded-lg text-xs font-mono space-y-1 text-zinc-700 dark:text-zinc-300">
                  <p># Optional server configuration in .env.local</p>
                  <p>APPLE_TEAM_ID=XXXXXXXXXX</p>
                  <p>APPLE_KEY_ID=XXXXXXXXXX</p>
                  <p>APPLE_PRIVATE_KEY=&quot;-----BEGIN PRIVATE KEY-----\n...&quot;</p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("web-token")}
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors"
                >
                  Configure via Web Token
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
