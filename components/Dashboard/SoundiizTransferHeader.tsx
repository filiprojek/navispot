"use client"

import React from "react"
import { ProviderId } from "@/types/provider"
import { ArrowRight, Server, Music, Radio, CheckCircle2, CircleDashed } from "lucide-react"

interface SoundiizTransferHeaderProps {
  activeSource: ProviderId
  activeDestination: ProviderId
  onSelectSource: (source: ProviderId) => void
  onSelectDestination: (dest: ProviderId) => void
  spotifyCount: number
  appleMusicCount: number
  navidromeCount: number
  isSpotifyConnected: boolean
  isAppleMusicConnected: boolean
  isNavidromeConnected: boolean
  isExporting: boolean
  onManageAppleMusic?: () => void
}

interface ProviderMeta {
  id: ProviderId
  name: string
  icon: React.ReactNode
  connected: boolean
  count: number
  colorClasses: {
    activeSource: string
    activeDest: string
    badgeConnected: string
    badgeDisconnected: string
  }
}

export function SoundiizTransferHeader({
  activeSource,
  activeDestination,
  onSelectSource,
  onSelectDestination,
  spotifyCount,
  appleMusicCount,
  navidromeCount,
  isSpotifyConnected,
  isAppleMusicConnected,
  isNavidromeConnected,
  isExporting,
  onManageAppleMusic,
}: SoundiizTransferHeaderProps) {
  const providers: ProviderMeta[] = [
    {
      id: "spotify",
      name: "Spotify",
      icon: <Music className="w-4 h-4 shrink-0" />,
      connected: isSpotifyConnected,
      count: spotifyCount,
      colorClasses: {
        activeSource: "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-200 ring-2 ring-emerald-500/20",
        activeDest: "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-200 ring-2 ring-emerald-500/20",
        badgeConnected: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
        badgeDisconnected: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
      },
    },
    {
      id: "apple-music",
      name: "Apple Music",
      icon: <Radio className="w-4 h-4 shrink-0" />,
      connected: isAppleMusicConnected,
      count: appleMusicCount,
      colorClasses: {
        activeSource: "border-rose-500 bg-rose-50/60 dark:bg-rose-950/20 text-rose-950 dark:text-rose-200 ring-2 ring-rose-500/20",
        activeDest: "border-rose-500 bg-rose-50/60 dark:bg-rose-950/20 text-rose-950 dark:text-rose-200 ring-2 ring-rose-500/20",
        badgeConnected: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-800",
        badgeDisconnected: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
      },
    },
    {
      id: "navidrome",
      name: "Navidrome",
      icon: <Server className="w-4 h-4 shrink-0" />,
      connected: isNavidromeConnected,
      count: navidromeCount,
      colorClasses: {
        activeSource: "border-blue-500 bg-blue-50/60 dark:bg-blue-950/20 text-blue-950 dark:text-blue-200 ring-2 ring-blue-500/20",
        activeDest: "border-blue-500 bg-blue-50/60 dark:bg-blue-950/20 text-blue-950 dark:text-blue-200 ring-2 ring-blue-500/20",
        badgeConnected: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800",
        badgeDisconnected: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
      },
    },
  ]

  return (
    <div className="mb-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Source Selector Bar */}
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Source Platform
            </span>
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
              Select origin to view & export playlists
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {providers.map((p) => {
              const isSelected = activeSource === p.id
              return (
                <button
                  key={`src-${p.id}`}
                  type="button"
                  disabled={isExporting}
                  onClick={() => {
                    onSelectSource(p.id)
                    if (p.id === "apple-music" && !p.connected && onManageAppleMusic) {
                      onManageAppleMusic()
                    }
                  }}
                  className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
                    isSelected
                      ? p.colorClasses.activeSource
                      : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-850/50 text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-medium text-xs">
                      {p.icon}
                      <span>{p.name}</span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                        p.connected
                          ? p.colorClasses.badgeConnected
                          : p.colorClasses.badgeDisconnected
                      }`}
                    >
                      {p.connected ? (
                        <CheckCircle2 className="w-2.5 h-2.5" />
                      ) : (
                        <CircleDashed className="w-2.5 h-2.5" />
                      )}
                      {p.connected ? "Ready" : "Offline"}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {p.connected ? `${p.count} playlists available` : "Click to select or paste URL"}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Transfer Arrow Icon */}
        <div className="hidden lg:flex flex-col items-center justify-center px-2 text-zinc-400 dark:text-zinc-600">
          <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
            <ArrowRight className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
          </div>
          <span className="text-[10px] uppercase font-semibold tracking-wider mt-1 text-zinc-400">
            Sync To
          </span>
        </div>

        {/* Destination Selector Bar */}
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Destination Platform
            </span>
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
              Where to export matched tracks
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {providers.map((p) => {
              const isSelected = activeDestination === p.id
              const isSameAsSource = activeSource === p.id
              const disabled = isExporting || isSameAsSource

              return (
                <button
                  key={`dest-${p.id}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onSelectDestination(p.id)
                    if (p.id === "apple-music" && !p.connected && onManageAppleMusic) {
                      onManageAppleMusic()
                    }
                  }}
                  title={
                    isSameAsSource
                      ? "Source and destination cannot be the same"
                      : !p.connected
                      ? `Connect ${p.name} to export tracks to it`
                      : `Export to ${p.name}`
                  }
                  className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between gap-1.5 ${
                    isSameAsSource
                      ? "opacity-35 cursor-not-allowed border-dashed border-zinc-200 dark:border-zinc-800 bg-transparent text-zinc-400"
                      : isSelected
                      ? `${p.colorClasses.activeDest} cursor-pointer`
                      : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-850/50 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                  } disabled:opacity-50`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-medium text-xs">
                      {p.icon}
                      <span>{p.name}</span>
                    </div>
                    {isSameAsSource ? (
                      <span className="text-[10px] text-zinc-400 italic">Source</span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                          p.connected
                            ? p.colorClasses.badgeConnected
                            : p.colorClasses.badgeDisconnected
                        }`}
                      >
                        {p.connected ? (
                          <CheckCircle2 className="w-2.5 h-2.5" />
                        ) : (
                          <CircleDashed className="w-2.5 h-2.5" />
                        )}
                        {p.connected ? "Ready" : "Offline"}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                    {isSameAsSource
                      ? "Source platform"
                      : p.connected
                      ? "Ready as destination"
                      : "Needs credentials"}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
