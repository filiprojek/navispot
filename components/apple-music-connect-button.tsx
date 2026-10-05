"use client"

import React, { useState } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { AppleMusicCredentialsModal } from "./apple-music-credentials-modal"
import { Music, CheckCircle2, Settings } from "lucide-react"

export function AppleMusicConnectButton() {
  const { appleMusic, isLoading } = useAuth()
  const [showModal, setShowModal] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-10 w-36 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
      </div>
    )
  }

  return (
    <>
      {appleMusic.isAuthenticated ? (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
            <Music className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Apple Music
              </span>
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900">
                <CheckCircle2 className="w-2.5 h-2.5" />
                {appleMusic.storefront.toUpperCase()}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            aria-label="Manage Apple Music connection"
            title="Manage connection settings"
            className="flex items-center gap-1.5 rounded-full border border-zinc-300 px-3.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <Settings className="w-3.5 h-3.5 text-zinc-500" />
            <span>Manage</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex h-10 items-center justify-center gap-2 rounded-full bg-[#FA233B] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#e01d33] disabled:opacity-50 cursor-pointer shadow-sm"
        >
          <Music className="h-4 w-4" />
          <span>Connect Apple Music</span>
        </button>
      )}

      <AppleMusicCredentialsModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  )
}
