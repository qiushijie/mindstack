package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa

#import <Cocoa/Cocoa.h>

static void setWindowNonOpaque() {
	dispatch_async(dispatch_get_main_queue(), ^{
		NSWindow *window = [[NSApplication sharedApplication] mainWindow];
		if (!window) {
			for (NSWindow *w in [[NSApplication sharedApplication] windows]) {
				if ([w isVisible] && [w isKindOfClass:[NSWindow class]]) {
					window = w;
					break;
				}
			}
		}
		if (window) {
			[window setOpaque:NO];
			[window setBackgroundColor:[NSColor clearColor]];
			[window setHasShadow:YES];
		}
	});
}

static BOOL isWindowFullscreen() {
	NSWindow *window = [[NSApplication sharedApplication] mainWindow];
	if (!window) {
		for (NSWindow *w in [[NSApplication sharedApplication] windows]) {
			if ([w isVisible] && [w isKindOfClass:[NSWindow class]]) {
				window = w;
				break;
			}
		}
	}
	if (!window) return NO;
	return ([window styleMask] & NSWindowStyleMaskFullScreen) != 0;
}

static void toggleWindowFullscreen() {
	dispatch_async(dispatch_get_main_queue(), ^{
		NSWindow *window = [[NSApplication sharedApplication] mainWindow];
		if (!window) {
			for (NSWindow *w in [[NSApplication sharedApplication] windows]) {
				if ([w isVisible] && [w isKindOfClass:[NSWindow class]]) {
					window = w;
					break;
				}
			}
		}
		if (!window) return;

		NSWindowCollectionBehavior behavior = [window collectionBehavior];
		behavior |= NSWindowCollectionBehaviorFullScreenPrimary;
		[window setCollectionBehavior:behavior];

		[window toggleFullScreen:nil];
	});
}
*/
import "C"

func setWindowNonOpaque() {
	C.setWindowNonOpaque()
}

func isWindowFullscreen() bool {
	return bool(C.isWindowFullscreen())
}

func toggleWindowFullscreen() {
	C.toggleWindowFullscreen()
}
