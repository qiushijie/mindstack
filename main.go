package main

import (
	"embed"

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
	// Create an instance of the app structure
	app := NewApp()

	// Build application menu
	appMenu := buildMenu(app)

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "MindStack",
		Width:  1280,
		Height: 800,
		Menu:   appMenu,
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

func buildMenu(app *App) *menu.Menu {
	appMenu := menu.NewMenu()

	fileMenu := appMenu.AddSubmenu("File")
	fileMenu.AddText("New", keys.CmdOrCtrl("n"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:file:new")
	})
	fileMenu.AddSeparator()
	fileMenu.AddText("Open Folder...", keys.CmdOrCtrl("o"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:file:open")
	})
	fileMenu.AddSeparator()
	fileMenu.AddText("Save", keys.CmdOrCtrl("s"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:file:save")
	})

	editMenu := appMenu.AddSubmenu("Edit")
	editMenu.AddText("Undo", keys.CmdOrCtrl("z"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:edit:undo")
	})
	editMenu.AddText("Redo", keys.CmdOrCtrl("shift+z"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:edit:redo")
	})
	editMenu.AddSeparator()
	editMenu.AddText("Cut", keys.CmdOrCtrl("x"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:edit:cut")
	})
	editMenu.AddText("Copy", keys.CmdOrCtrl("c"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:edit:copy")
	})
	editMenu.AddText("Paste", keys.CmdOrCtrl("v"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:edit:paste")
	})

	viewMenu := appMenu.AddSubmenu("View")
	viewMenu.AddText("Settings", keys.CmdOrCtrl(","), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:navigate", "settings")
	})
	viewMenu.AddSeparator()
	viewMenu.AddText("Toggle Full Screen", keys.Key("f11"), func(_ *menu.CallbackData) {
		runtime.WindowToggleMaximise(app.ctx)
	})

	helpMenu := appMenu.AddSubmenu("Help")
	helpMenu.AddText("About MindStack", nil, func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:navigate", "about")
	})

	return appMenu
}
