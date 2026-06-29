#!/bin/bash
cd "$(dirname "$0")"
echo "正在启动世界杯 AI 预测器..."
node server.js &
SERVER_PID=$!
sleep 1
open "http://localhost:8765"
echo ""
echo ">>> 浏览器已打开。要停止服务器，关闭此窗口或按 Ctrl+C <<<"
echo ""
trap "kill $SERVER_PID 2>/dev/null" EXIT
wait $SERVER_PID
