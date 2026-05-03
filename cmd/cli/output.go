package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
)

var (
	stdoutWriter io.Writer = os.Stdout
	stderrWriter io.Writer = os.Stderr
	exitFunc               = os.Exit
)

func writeJSON(v interface{}) {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		fmt.Fprintf(stderrWriter, `{"error":"json marshal: %s"}`, err.Error())
		exitFunc(1)
	}
	stdoutWriter.Write(data)
	stdoutWriter.Write([]byte("\n"))
}

func writeError(exitCode int, code string, msg string) {
	errResp := map[string]string{"error": msg, "code": code}
	data, _ := json.Marshal(errResp)
	fmt.Fprintln(stderrWriter, string(data))
	exitFunc(exitCode)
}
