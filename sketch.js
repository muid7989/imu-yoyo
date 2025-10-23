let time;
let frameCountBuffer = 0;
let fps = 0;

const CANVAS_W = 960;
const CANVAS_H = 1280;
const GRID_SIZE = 64;

const BUTTON_OFFSET = 8;
const BUTTON_W = GRID_SIZE*3;
const BUTTON_H = GRID_SIZE*2;
const BUTTON_X = GRID_SIZE*1;
const BUTTON_Y = CANVAS_H-GRID_SIZE*3;
const BUTTON_M = 24;

// for M5
const NAME_PRE = 'UART';
const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_RX_CHARACTERISTIC_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const UART_TX_CHARACTERISTIC_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
let bleDevice;
let rxCharacteristic;
let isConnected;
let dataCount;
let dataRate;
let val = [];

let connectButton, startButton;

let dataBuf = [];
let dataIndex;
const DATA_SIZE = 200;
let drawIndex;
let logFlag;
let idCheck = 0;
let lossCount = 0;
let outputBuf = [];
let outputIndex;
let dataTime;

const ACC_EF = 0.0001;
let xSpeed, zSpeed;
const SPEED_AT = 0.98;
let xPos, zPos;
let prevXPos, prevZPos, prevInt;
const POS_EF = 0.95;
const CX = GRID_SIZE*7.5;
const CY = GRID_SIZE*7;
const SP_EF = 0.00001;

let ball;

const DEBUG = true;
const DEBUG_VIEW_X = 20;
const DEBUG_VIEW_Y = 20;
const DEBUG_VIEW_H = 20;

function preload() {
}
function setup() {
	createCanvas(CANVAS_W, CANVAS_H);
	frameRate(120);
	time = millis();
	rectMode(CENTER);

	for (let i=0; i<DATA_SIZE; i++){
		dataBuf[i] = [];
	}
	dataIndex = 0;
	isConnected = false;
	dataCount = 0;
	dataRate = 0;
	drawIndex = 0;
	xPos = CX;
	zPos = CY;
	xSpeed = 0;
	zSpeed = 0;
	logFlag = false;

	startButton = buttonInit('start', BUTTON_W, BUTTON_H, BUTTON_X, BUTTON_Y);
	startButton.mousePressed(startFn);
	connectButton = buttonInit('connect', BUTTON_W, BUTTON_H, BUTTON_X+BUTTON_M+BUTTON_W, BUTTON_Y);
	connectButton.mousePressed(connectToBle);

	ball = {};
	ball.x = CX;
	ball.y = CY;
	ball.size = 50;
}
function buttonInit(text, w, h, x, y) {
	let button = createButton(text);
	button.size(w,h);
	button.position(x+BUTTON_OFFSET,y+BUTTON_OFFSET);
	button.style('font-size', '16px');
	return button;
}
function startFn() {
	if (logFlag){
		logFlag = false;
	}else{
		logFlag = true;
		dataTime = millis();
	}
//	console.log(dataBuf);
}
function draw() {
	background(48);
	let current = millis();
	if ( (current-time)>=1000 ){
		time += 1000;
		fps = frameCount - frameCountBuffer;
		frameCountBuffer = frameCount;
		dataRate = dataCount;
		dataCount = 0;
	}
	if (DEBUG){
		stroke(128);
		strokeWeight(1);
		for (let i=0; i<CANVAS_H/GRID_SIZE; i++){
			line(0, i*GRID_SIZE, CANVAS_W, i*GRID_SIZE);
		}
		for (let i=0; i<CANVAS_W/GRID_SIZE; i++){
			line(i*GRID_SIZE, 0, i*GRID_SIZE, CANVAS_H);
		}
	}
	fill(255);
	textSize(16);
	stroke(255);
	strokeWeight(1);
	let debugY = DEBUG_VIEW_Y;
	text('fps:'+fps, DEBUG_VIEW_X, debugY);
	debugY += DEBUG_VIEW_H;
	text('dataRate'+':'+dataRate, DEBUG_VIEW_X, debugY);
	debugY += DEBUG_VIEW_H;
	text('loss:'+lossCount, DEBUG_VIEW_X, debugY);

	if (logFlag){
		for (let i=0; i<8; i++){
			if (drawIndex==dataIndex){
				break;
			}
			if (current<dataTime){
				break;
			}
			prevXPos = xPos;
			prevZPos = zPos;
			prevInt = dataBuf[drawIndex][val.length-1];
			dataTime += prevInt;
			xPos += xSpeed;
			zPos += zSpeed;
			xSpeed *= SPEED_AT;
			zSpeed *= SPEED_AT;
			const f = SP_EF * dist(xPos, zPos, CX, CY);
			xSpeed += dataBuf[drawIndex][2]*ACC_EF + f*(CX-xPos);
			zSpeed += dataBuf[drawIndex][4]*ACC_EF + f*(CY-zPos);
			dataBuf[drawIndex][val.length] = xPos;
			drawIndex++;
			if (drawIndex>=DATA_SIZE){
				drawIndex = 0;
			}
	//		console.log(current, dataTime);
		}
		if (current>dataTime){
			dataTime = current+20;
		}
		ball.x = xPos + (prevXPos-xPos)*(dataTime-current)/prevInt;
		ball.y = zPos + (prevZPos-zPos)*(dataTime-current)/prevInt;
	}
	fill(255);
	noStroke();
	circle(ball.x, ball.y, ball.size);
	stroke(255);
	strokeWeight(3);
	line(xPos, zPos, CX, CY);
}
function writeBLE(val) {
	if (isConnected){
		const data = new Uint8Array([0x00,val]);
		rxCharacteristic.writeValue(data);
		console.log('Write data',data);
	}
}
async function connectToBle() {
	try {
		console.log("Requesting Bluetooth Device...");
		bleDevice = await navigator.bluetooth.requestDevice({
			filters: [{ namePrefix: NAME_PRE }],
			optionalServices: [UART_SERVICE_UUID]
		});
		console.log("Connecting to GATT Server...");
		const server = await bleDevice.gatt.connect();

		console.log("Getting Service...");
		const service = await server.getPrimaryService(UART_SERVICE_UUID);

		console.log("Getting Characteristics...");
		const txCharacteristic = await service.getCharacteristic(
			UART_TX_CHARACTERISTIC_UUID
		);
		txCharacteristic.startNotifications();
		txCharacteristic.addEventListener(
			"characteristicvaluechanged",
			e => {
				onTxCharacteristicValueChanged(e);
			}
		);
		rxCharacteristic = await service.getCharacteristic(
			UART_RX_CHARACTERISTIC_UUID
		);
		isConnected = true;
	} catch (error) {
		console.log(error);
	}
	function onTxCharacteristicValueChanged(event) {
		dataCount++;
		let receivedData = [];
//		let id = event.target.value.getUint16(0, true);
		for (let i=0; i<2; i++){
			receivedData[i] = event.target.value.getUint16(i*2, true);
		}
		for (let i=2; i<event.target.value.byteLength/2; i++){
			receivedData[i] = event.target.value.getInt16(i*2, false);
		}
		let id = receivedData[0];
		let senseInterval = (receivedData[1]-val[1])/10;
		if (receivedData[1]<val[1]){
			senseInterval = (50000+receivedData[1]-val[1])/10;
		}
//		console.log(id, receivedData);
		for (let i=0; i<receivedData.length; i++){
			val[i] = receivedData[i];
			dataBuf[dataIndex][i] = val[i];
		}
		val[receivedData.length] = senseInterval;
		dataBuf[dataIndex][receivedData.length] = senseInterval;
		if (idCheck!=id){
			idCheck = id+1;
			lossCount++;
		}else{
			idCheck++;
			if (idCheck>=65536){
				idCheck = 0;
			}
		}
		if (logFlag){
			dataIndex++;
			if (dataIndex>=DATA_SIZE){
				dataIndex = 0;
			}
		}
	}
}


