import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import React, { act } from "react"
import { createRoot, Root } from "react-dom/client"
import { AppleMusicConnectButton } from "@/components/apple-music-connect-button"
import { AppleMusicCredentialsModal } from "@/components/apple-music-credentials-modal"
import { SoundiizTransferHeader } from "@/components/Dashboard/SoundiizTransferHeader"
import * as AuthContextModule from "@/lib/auth/auth-context"
import { AuthContextType } from "@/types/auth-context"

// Mock useAuth
vi.mock("@/lib/auth/auth-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/auth-context")>()
  return {
    ...actual,
    useAuth: vi.fn(),
  }
})

describe("Apple Music UI Components (frontend-m3-clean)", () => {
  let container: HTMLDivElement
  let root: Root

  const defaultAuthMock = {
    appleMusic: {
      isAuthenticated: false,
      mode: null,
      developerToken: "mock-dev-token",
      musicUserToken: null,
      storefront: "us",
      error: null,
    },
    activeSource: "spotify" as const,
    activeDestination: "navidrome" as const,
    setActiveSource: vi.fn(),
    setActiveDestination: vi.fn(),
    connectAppleMusicWithTokens: vi.fn().mockResolvedValue(true),
    disconnectAppleMusic: vi.fn(),
    refreshAppleMusicPlaylists: vi.fn(),
    appleMusicPlaylists: [],
    appleMusicFavoritesCount: 0,
    spotify: { isAuthenticated: true, user: null, token: "mock-token" },
    navidrome: { isConnected: true, credentials: { url: "http://mock", username: "u", password: "p" } },
    playlists: [],
    navidromePlaylists: [],
    likedSongsCount: 10,
    refreshing: false,
    refreshData: vi.fn(),
  }

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ developerToken: "mock-dev-token" }),
    } as unknown as Response)
    vi.mocked(AuthContextModule.useAuth).mockReturnValue(defaultAuthMock as unknown as AuthContextType)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.clearAllMocks()
  })

  describe("AppleMusicConnectButton", () => {
    it("renders disconnected state with vector icon and no emojis", () => {
      act(() => {
        root.render(<AppleMusicConnectButton />)
      })

      const button = container.querySelector("button")
      expect(button).not.toBeNull()
      expect(button?.textContent).toContain("Connect Apple Music")

      // Ensure NO emojis in the rendered text
      const emojiRegex = /\p{Extended_Pictographic}/u
      expect(emojiRegex.test(container.textContent || "")).toBe(false)
    })

    it("renders connected state with storefront badge and status indicator", () => {
      vi.mocked(AuthContextModule.useAuth).mockReturnValue({
        ...defaultAuthMock,
        appleMusic: {
          isAuthenticated: true,
          mode: "token",
          developerToken: "mock-dev",
          musicUserToken: "mock-user",
          storefront: "us",
          error: null,
        },
      } as unknown as AuthContextType)

      act(() => {
        root.render(<AppleMusicConnectButton />)
      })

      expect(container.textContent).toContain("Apple Music")
      expect(container.textContent).toContain("US")
      const manageButton = container.querySelector("button")
      expect(manageButton?.textContent).toContain("Manage")
    })

    it("opens credentials modal when button is clicked", () => {
      act(() => {
        root.render(<AppleMusicConnectButton />)
      })

      const button = container.querySelector("button")
      act(() => {
        button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      })

      // Modal dialog should now be present in the document
      const dialog = document.querySelector('[role="dialog"]')
      expect(dialog).not.toBeNull()
      expect(dialog?.textContent).toContain("Apple Music Authentication")
    })
  })

  describe("AppleMusicCredentialsModal", () => {
    it("renders setup modal with Web Session Token and Developer tabs", () => {
      act(() => {
        root.render(<AppleMusicCredentialsModal isOpen={true} onClose={vi.fn()} />)
      })

      const modalText = document.body.textContent || ""
      expect(modalText).toContain("Web Session Token")
      expect(modalText).toContain("Developer Mode")
      expect(modalText).toContain("Media-User-Token")

      // Verify zero emojis
      const emojiRegex = /\p{Extended_Pictographic}/u
      expect(emojiRegex.test(modalText)).toBe(false)
    })

    it("submits Web Session Token and calls connectAppleMusicWithTokens", async () => {
      const mockConnect = vi.fn().mockResolvedValue(true)
      const mockClose = vi.fn()

      vi.mocked(AuthContextModule.useAuth).mockReturnValue({
        ...defaultAuthMock,
        connectAppleMusicWithTokens: mockConnect,
      } as unknown as AuthContextType)

      act(() => {
        root.render(<AppleMusicCredentialsModal isOpen={true} onClose={mockClose} />)
      })

      const tokenTextarea = document.body.querySelector("textarea#media-user-token") as HTMLTextAreaElement
      expect(tokenTextarea).not.toBeNull()

      act(() => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value",
        )?.set
        nativeSetter?.call(tokenTextarea, "test-music-user-token")
        tokenTextarea.dispatchEvent(new Event("input", { bubbles: true }))
      })

      const form = document.body.querySelector("form")
      expect(form).not.toBeNull()

      await act(async () => {
        form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      })

      expect(mockConnect).toHaveBeenCalledWith(
        expect.objectContaining({
          musicUserToken: "test-music-user-token",
          storefront: "us",
        }),
      )
    })

    it("allows disconnecting when Apple Music is connected", () => {
      const mockDisconnect = vi.fn()
      vi.mocked(AuthContextModule.useAuth).mockReturnValue({
        ...defaultAuthMock,
        appleMusic: {
          isAuthenticated: true,
          mode: "token",
          developerToken: "dev-tok",
          musicUserToken: "user-tok",
          storefront: "us",
          error: null,
        },
        disconnectAppleMusic: mockDisconnect,
      } as unknown as AuthContextType)

      act(() => {
        root.render(<AppleMusicCredentialsModal isOpen={true} onClose={vi.fn()} />)
      })

      const disconnectBtn = Array.from(document.body.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Disconnect"),
      )
      expect(disconnectBtn).not.toBeNull()

      act(() => {
        disconnectBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      })

      expect(mockDisconnect).toHaveBeenCalled()
    })
  })

  describe("SoundiizTransferHeader", () => {
    it("renders source and destination platforms with selection state", () => {
      const onSelectSource = vi.fn()
      const onSelectDestination = vi.fn()

      act(() => {
        root.render(
          <SoundiizTransferHeader
            activeSource="spotify"
            activeDestination="navidrome"
            onSelectSource={onSelectSource}
            onSelectDestination={onSelectDestination}
            spotifyCount={12}
            appleMusicCount={5}
            navidromeCount={20}
            isSpotifyConnected={true}
            isAppleMusicConnected={true}
            isNavidromeConnected={true}
            isExporting={false}
          />,
        )
      })

      expect(container.textContent).toContain("Source Platform")
      expect(container.textContent).toContain("Destination Platform")
      expect(container.textContent).toContain("Sync To")

      // Check Spotify source card has count
      expect(container.textContent).toContain("12 playlists available")

      // Find Apple Music button in source section and click it
      const buttons = Array.from(container.querySelectorAll("button"))
      const appleMusicSourceBtn = buttons.find((b) => b.textContent?.includes("Apple Music") && b.getAttribute("disabled") === null)
      expect(appleMusicSourceBtn).not.toBeNull()

      act(() => {
        appleMusicSourceBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      })

      expect(onSelectSource).toHaveBeenCalledWith("apple-music")
    })

    it("disables destination platform when identical to source platform", () => {
      act(() => {
        root.render(
          <SoundiizTransferHeader
            activeSource="spotify"
            activeDestination="navidrome"
            onSelectSource={vi.fn()}
            onSelectDestination={vi.fn()}
            spotifyCount={10}
            appleMusicCount={5}
            navidromeCount={20}
            isSpotifyConnected={true}
            isAppleMusicConnected={true}
            isNavidromeConnected={true}
            isExporting={false}
          />,
        )
      })

      // The destination Spotify button must be disabled because activeSource === "spotify"
      const buttons = Array.from(container.querySelectorAll("button"))
      const destSpotifyBtn = buttons.find((b) => b.textContent?.includes("Source platform") || (b.textContent?.includes("Spotify") && b.disabled))
      expect(destSpotifyBtn).not.toBeNull()
      expect(destSpotifyBtn?.disabled).toBe(true)
    })
  })
})
