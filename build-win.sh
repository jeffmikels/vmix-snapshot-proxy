#!/bin/bash

TARGET=release/vmix-snapshot-proxy/resources/app
if [[ ! -d $TARGET ]]; then mkdir "$TARGET"; fi
rm -rf $TARGET/*
mkdir "$TARGET/lib"

install() {
	cp "$1" "$TARGET/$1"
}

install package.json
install main.js
install preload.js
install renderer.js
install index.html
install lib/vue.js

# install node_modules
pushd "$TARGET"
npm i --production
popd
