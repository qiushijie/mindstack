package db

import (
	"fmt"
	"os"
	"path/filepath"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

var instance *gorm.DB

func Init() (*gorm.DB, error) {
	if instance != nil {
		return instance, nil
	}

	dir, err := os.UserConfigDir()
	if err != nil {
		dir = "."
	}
	dbPath := filepath.Join(dir, "mindstack", "chat.db")

	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, fmt.Errorf("create db dir: %w", err)
	}

	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	instance = db
	return db, nil
}

func Get() *gorm.DB {
	if instance == nil {
		panic("db not initialized: call Init() first")
	}
	return instance
}
