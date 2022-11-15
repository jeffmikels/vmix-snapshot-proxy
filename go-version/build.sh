#!/bin/bash

go mod tidy
env GOOS=windows GOARCH=amd64 go build -o vmix-snapshot-proxy.exe

zip -u vmix-snapshot-proxy.zip vmix-snapshot-proxy.exe vmix-snapshot-proxy.bat
