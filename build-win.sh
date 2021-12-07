#!/bin/bash

TARGET=release/vmix-snapshot-proxy/resources/app
if [[ ! -d $TARGET ]]; then mkdir "$TARGET"; fi
if [[ ! -d $TARGET/lib ]]; then mkdir "$TARGET/lib"; fi

install() {
	cp "$1" "$TARGET/$1"
}

install package.json
install main.js
install index.html
install lib/vue.js
