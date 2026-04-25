package main

import (
	"embed"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()
	app.LoadConfig()

	err := wails.Run(&options.App{
		Title:  "MindStack",
		Width:  1280,
		Height: 800,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}

func (a *App) buildMenu() *menu.Menu {
	appMenu := menu.NewMenu()

	fileMenu := appMenu.AddSubmenu("File")
	fileMenu.AddText("New", keys.CmdOrCtrl("n"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:file:new")
	})
	fileMenu.AddSeparator()
	fileMenu.AddText("Open File...", keys.Key("ctrl+shift+o"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:file:open-file")
	})
	fileMenu.AddText("Open Folder...", keys.CmdOrCtrl("o"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:file:open")
	})

	// Recent submenu
	recentMenu := fileMenu.AddSubmenu("Open Recent")
	a.mu.RLock()
	entries := make([]RecentEntry, len(a.recentEntries))
	copy(entries, a.recentEntries)
	a.mu.RUnlock()

	if len(entries) == 0 {
		item := recentMenu.AddText("No Recent Items", nil, func(_ *menu.CallbackData) {})
		item.Disabled = true
	} else {
		for i := range entries {
			e := entries[i]
			recentMenu.AddText(e.Path, nil, func(_ *menu.CallbackData) {
				if _, err := os.Stat(e.Path); os.IsNotExist(err) {
					a.removeRecentEntry(e.Path)
					return
				}
				runtime.EventsEmit(a.ctx, "menu:file:open-recent", e.Path, e.IsDir)
			})
		}
		recentMenu.AddSeparator()
		recentMenu.AddText("Clear Recent Items", nil, func(_ *menu.CallbackData) {
			a.ClearRecentEntries()
		})
	}

	fileMenu.AddSeparator()
	fileMenu.AddText("Save", keys.CmdOrCtrl("s"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:file:save")
	})

	editMenu := appMenu.AddSubmenu("Edit")
	editMenu.AddText("Undo", keys.CmdOrCtrl("z"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:edit:undo")
	})
	editMenu.AddText("Redo", keys.CmdOrCtrl("shift+z"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:edit:redo")
	})
	editMenu.AddSeparator()
	editMenu.AddText("Cut", keys.CmdOrCtrl("x"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:edit:cut")
	})
	editMenu.AddText("Copy", keys.CmdOrCtrl("c"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:edit:copy")
	})
	editMenu.AddText("Paste", keys.CmdOrCtrl("v"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:edit:paste")
	})

	viewMenu := appMenu.AddSubmenu("View")
	viewMenu.AddText("Settings", keys.CmdOrCtrl(","), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:navigate", "settings")
	})
	viewMenu.AddSeparator()
	viewMenu.AddText("Toggle Full Screen", keys.Key("f11"), func(_ *menu.CallbackData) {
		runtime.WindowToggleMaximise(a.ctx)
	})

	helpMenu := appMenu.AddSubmenu("Help")
	helpMenu.AddText("About MindStack", nil, func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:navigate", "about")
	})

	return appMenu
}

func (a *App) rebuildMenu() {
	if a.ctx == nil {
		return
	}
	newMenu := a.buildMenu()
	runtime.MenuSetApplicationMenu(a.ctx, newMenu)
}
