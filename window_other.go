//go:build !darwin

package main

// setWindowNonOpaque applies the macOS-only transparent window background.
// No-op on non-darwin platforms where the native transparent effect is not used.
func setWindowNonOpaque() {}

// isWindowFullscreen reports whether the window is in fullscreen mode.
// Non-darwin platforms do not track native fullscreen state yet.
func isWindowFullscreen() bool {
	return false
}

// toggleWindowFullscreen toggles native window fullscreen. No-op on non-darwin
// platforms until a platform-specific implementation is added.
func toggleWindowFullscreen() {}
