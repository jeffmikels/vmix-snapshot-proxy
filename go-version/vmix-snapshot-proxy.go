package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"encoding/xml"

	"github.com/gofiber/fiber/v2"
)

var myIp string
var proxyPort int = 8098
var vmixIP string = "localhost"
var vmixPort int = 8088
var vmixUrl string
var vmixPath string = fmt.Sprintf("%s\\Documents\\vMixStorage", os.Getenv("USERPROFILE"))

/* Example vMix Input XML
<inputs>
<input key="26cae087-b7b6-4d45-98e4-de03ab4feb6b" number="1" type="Xaml" title="NewsHD.xaml" state="Paused" position="0" duration="0" muted="True" loop="False" selectedIndex="0">
NewsHD.xaml
<text index="0" name="Headline">Hello</text>
<text index="1" name="Description">Hello</text>
</input>
<input key="55cbe357-a801-4d54-8ff2-08ee68766fae" number="2" type="VirtualSet" title="LateNightNews" state="Paused" position="0" duration="0" muted="True" loop="False" selectedIndex="0">
LateNightNews
<overlay index="0" key="2fe8ff9d-e400-4504-85ab-df7c17a1edd4"/>
<overlay index="1" key="20e4ee9a-05cc-4f58-bb69-cd179e1c1958"/>
<overlay index="2" key="94b88db0-c5cd-49d8-98a2-27d83d4bf3fe"/>
</input>
</inputs>
*/

// XML structs for later decomposition
type Vmix struct {
	XMLName xml.Name `xml:"vmix"`
	Inputs  Inputs   `xml:"inputs"`
}

type Inputs struct {
	XMLName xml.Name `xml:"inputs"`
	Inputs  []Input  `xml:"input"`
}

//Input{name: "Camera 1", number: 1}
type Input struct {
	XMLName xml.Name `xml:"input"`
	Name    string   `xml:"title,attr"`
	Number  string   `xml:"number,attr"`
}

// declare this as a global variable
var vmix Vmix

func main() {
	myIp = GetOutboundIP().String()

	// flag parser settings
	pathPtr := flag.String("d", "default", "path to the vMix Storage Directory")
	portPtr := flag.Int("p", vmixPort, "port as set in the vMix web API settings")

	flag.Parse()
	if *pathPtr != "default" {
		vmixPath = *pathPtr
	}
	vmixUrl = fmt.Sprintf("http://%s:%d/api", vmixIP, *portPtr)

	// start the http server
	app := fiber.New()

	// on the root route, refresh inputs and return them
	app.Get("/", func(c *fiber.Ctx) error {
		GetInputs()
		json := "["
		var jsonStrings []string
		for i := 0; i < len(vmix.Inputs.Inputs); i++ {
			input := vmix.Inputs.Inputs[i]
			jsonStrings = append(jsonStrings, fmt.Sprintf(`{"name":"%s", "number":%s}`, input.Name, input.Number))
		}
		json += strings.Join(jsonStrings, ",") + "]"
		return c.SendString(json)
	})

	// on the regen route, re-request all snapshots
	app.Get("/regen", func(c *fiber.Ctx) error {
		RequestSnapshots(-1)
		return c.SendString("snapshots are regenerating")
	})

	// request regeneration of one input
	app.Get("/regen/:input", func(c *fiber.Ctx) error {
		input, err := strconv.Atoi(c.Params("input"))
		if err != nil {
			return c.SendString("request was invalid")
		}
		RequestSnapshots(input)
		return c.SendString("snapshot " + c.Params("input") + " is regenerating")
	})

	// app.Use("/:input.jpg", func(c *fiber.Ctx) error {
	// 	// Set some security headers:
	// 	// c.Set("X-XSS-Protection", "1; mode=block")
	// 	// c.Set("X-Content-Type-Options", "nosniff")
	// 	// c.Set("X-Download-Options", "noopen")
	// 	// c.Set("Strict-Transport-Security", "max-age=5184000")
	// 	// c.Set("X-Frame-Options", "SAMEORIGIN")
	// 	// c.Set("X-DNS-Prefetch-Control", "off")
	// 	input, err := strconv.Atoi(c.Params("input"))
	// 	if err != nil {
	// 		return c.SendString("request was invalid")
	// 	}
	// 	RequestSnapshots(input)

	// 	// Go to next middleware:
	// 	return c.Next()
	// })

	// do the static route
	app.Static("/", vmixPath)

	// start the interval to refresh snapshots
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	lastInput := 0
	tickerCounter := 0
	go func() {
		for range ticker.C {
			// ask for a snapshot
			if len(vmix.Inputs.Inputs) > 0 {
				lastInput = (lastInput + 1) % len(vmix.Inputs.Inputs)
				RequestSnapshots(lastInput)
			}

			// maybe ask for all inputs again
			tickerCounter = (tickerCounter + 1) % 20 // counts to 10 seconds
			if tickerCounter == 0 {
				GetInputs()
				PrintStatus()
			}
		}
	}()

	// listen to the telnet socket
	// setup the telnet connection to vmix too
	var conn net.Conn
	go func() {
		var telnetError error
		buffer := make([]byte, 1024)
		accum := []byte{}
		for {
			if conn == nil {
				conn, telnetError = net.Dial("tcp", "localhost:8099")
				if telnetError == nil {
					fmt.Println("No connection to vMix Telent API: (localhost:8099)")
					continue
				}
				conn.Write([]byte("SUBSCRIBE TALLY\r\n"))
			} else {
				conn.SetReadDeadline(time.Now().Add(time.Millisecond * 10))
				count, err := conn.Read(buffer)
				if err != nil {
					conn = nil
					accum = []byte{}
				} else {
					accum = append(accum, buffer[0:count]...)
					str := string(accum)
					lines := strings.Split(str, "\r\n")
					for i, line := range lines {
						fields := strings.Split(line, " ")
						// will be SUBSCRIBE OK TALLY
						// or      TALLY OK 0121...
						if len(fields) > 0 && fields[0] == "TALLY" {
							RequestSnapshots(0)
						}
						// if it is the last element of the lines slice, make it the new accumulator
						if i == len(lines)-1 {
							accum = []byte(line)
						}
					}

				}
			}
			time.Sleep(time.Second)
		}
	}()

	// start the server
	app.Listen(fmt.Sprintf("%s:%d", myIp, proxyPort))

	if conn != nil {
		conn.Close()
	}

}

func PrintStatus() {
	fmt.Println("=====================================================================================")
	fmt.Println("|- SETTINGS ---------------------------------------------------------------------------")
	fmt.Printf("| vMix Storage Path:                        %s\n", vmixPath)
	fmt.Printf("| vMix Web API URL:                         %s\n", vmixUrl)
	fmt.Println("|- AVAILABLE COMMANDS -----------------------------------------------------------------")
	fmt.Printf("| Running vMix Snapshot Proxy at port %d\n", proxyPort)
	fmt.Printf("| Get a list of all inputs:                 http://%s:%d/\n", myIp, proxyPort)
	fmt.Printf("| Force regen one input (0 means program):  http://%s:%d/regen/#\n", myIp, proxyPort)
	fmt.Printf("| Force regen all inputs:                   http://%s:%d/regen\n", myIp, proxyPort)
	fmt.Printf("| Get input snapshot:                       http://%s:%d/#.jpg\n", myIp, proxyPort)
	fmt.Println("|")
	fmt.Println("| Getting an input snapshot sends the most recent snapshot, and queues the generation of a new one.")
	fmt.Println("| If there are no snapshots for that input yet, it will wait a bit before trying again.")
	fmt.Println("| Snapshots take about 1 second to process")
	fmt.Println("=====================================================================================")
}

func DoRequest(url string) []byte {
	resp, err := http.Get(url)
	if err != nil {
		print(`ERROR attempting to reach vMix: ` + url)
		return nil
	}
	defer resp.Body.Close()

	// get response body
	bodyBytes, _ := io.ReadAll(resp.Body)
	return bodyBytes
}

// will request the XML from vMix and parse the inputs saving the results
// to the global `inputs` variable
func GetInputs() {
	url := vmixUrl + "?XML"
	fmt.Println(url)
	bodyBytes := DoRequest(url)
	if bodyBytes == nil {
		fmt.Println("ERROR: vMix failed to retriev inputs... Is vMix running?")
		return
	}
	fmt.Println(string(bodyBytes))

	// clear out the old vmix data
	vmix = Vmix{}
	err := xml.Unmarshal(bodyBytes, &vmix)
	if err != nil {
		print(err)
	}

	for i := 0; i < len(vmix.Inputs.Inputs); i++ {
		fmt.Println("Input Name: " + vmix.Inputs.Inputs[i].Name)
		fmt.Println("Input Number: " + vmix.Inputs.Inputs[i].Number)
	}
}

// this will tell vMix to generate a snapshot of the specified input
// if `inputNumber` is -1, it will request a snapshot for all inputs
// if `inputNumber` is 0, it will generate a snapshot for the program
// remember that vMix inputs are 1-indexed
func RequestSnapshots(inputNumber int) {
	if inputNumber == -1 {
		for i := 0; i <= len(vmix.Inputs.Inputs); i++ {
			go RequestSnapshots(i)
		}
	} else {
		var url string
		if inputNumber == 0 {
			url = vmixUrl + "?Function=Snapshot&Value=0.jpg"
		} else {
			url = fmt.Sprintf("%s?Function=SnapshotInput&Input=%d&Value=%d.jpg", vmixUrl, inputNumber, inputNumber)
		}
		fmt.Println(url)
		bytes := DoRequest(url)
		fmt.Println(string(bytes))
	}
}

// Get preferred outbound ip of this machine
func GetOutboundIP() net.IP {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()

	localAddr := conn.LocalAddr().(*net.UDPAddr)

	return localAddr.IP
}
