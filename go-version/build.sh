#!/bin/bash

env GOOS=windows GOARCH=amd64 go build -o vmix-snapshot-proxy.exe
