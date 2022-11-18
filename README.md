# vMix Snapshot Proxy

vMix has a robust API, but one key limitation of the API is that while you can
tell vMix to take a snapshot of an input, it will save the image on the vMix
machine but not send the image over the network.

The Snapshot Proxy is a small application written in the Go language to automatically generate
those images and provide them over the network to other applications.

The application is especially helpful in providing preview images of each input for

- [Unofficial vMix Remote Control for Android](https://play.google.com/store/apps/details?id=org.jeffmikels.vmix_remote)
- [Unofficial vMix Remote Control for iOS](https://apps.apple.com/us/app/unofficial-vmix-remote-control/id1551404035)

Instructional Video here: https://youtu.be/7tXUx9Q_O58

## Installation:

-   Download the latest zip file from the [Releases Page](https://github.com/jeffmikels/vmix-snapshot-proxy/releases)
-   Unzip the file.
-   Put the `.exe` and the `.bat` files both in the same directory wherever you want (NOTE: they must be on the SAME computer that's running vMix).
-   Start vMix.
-   Double-click on the `.bat` file.
-   If you have problems, look at the `.bat` file for the available command line options:
    -   `-h` will print the help
    -   `-p` will allow you to specify the Web API port vMix is using
    -   `-d` will allow you to specify the directory where vMix stores snapshot images

## Advanced Usage:

When running, the proxy will open a web server at port `8098` and will expose the following HTTP endpoints:

-   `http://[IP_ADDRESS]:8098/` will return a list of all the discovered vMix inputs
-   `http://[IP_ADDRESS]:8098/regen` will trigger a global regeneration of all input snapshots
-   `http://[IP_ADDRESS]:8098/regen/[INPUT_NUMBER]` will trigger a regeneration of one input's snapshot
-   `http://[IP_ADDRESS]:8098/[INPUT_NUMBER].jpg` will serve the input snapshot as a jpg image.
