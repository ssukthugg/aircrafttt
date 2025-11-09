// app.js (핵심 로직)

let web3;
let maintenanceContract;
let residualValueChartInstance = null; // 그래프 인스턴스
const statusDiv = document.getElementById('status');
const simulationStatusDiv = document.getElementById('simulationStatus');

// 🚨🚨 사용자 정의 변수: 여기에 당신의 실제 값을 넣어주세요! 🚨🚨
// 1. truffle migrate 후 나온 실제 컨트랙트 주소
const CONTRACT_ADDRESS = '0xA088bd84aF1674438b038C400F326c8993Bde630'; 
// 2. AircraftMaintenanceHistory.json 파일의 "abi" 항목 전체를 복사하여 넣으세요.
const CONTRACT_ABI = [
    {
      "inputs": [
        {
          "internalType": "address[]",
          "name": "_admins",
          "type": "address[]"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "recordId",
          "type": "uint256"
        }
      ],
      "name": "RecordSaved",
      "type": "event"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "admins",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function",
      "constant": true
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "maintenanceRecords",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "internalType": "string",
          "name": "contents",
          "type": "string"
        }
      ],
      "stateMutability": "view",
      "type": "function",
      "constant": true
    },
    {
      "inputs": [
        {
          "components": [
            {
              "internalType": "uint256",
              "name": "id",
              "type": "uint256"
            },
            {
              "internalType": "string",
              "name": "contents",
              "type": "string"
            }
          ],
          "internalType": "struct AircraftMaintenanceHistory.MaintenanceRecord[]",
          "name": "_records",
          "type": "tuple[]"
        }
      ],
      "name": "recordMaintenance",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        }
      ],
      "name": "getMaintenanceRecord",
      "outputs": [
        {
          "components": [
            {
              "internalType": "uint256",
              "name": "id",
              "type": "uint256"
            },
            {
              "internalType": "string",
              "name": "contents",
              "type": "string"
            }
          ],
          "internalType": "struct AircraftMaintenanceHistory.MaintenanceRecord",
          "name": "",
          "type": "tuple"
        }
      ],
      "stateMutability": "view",
      "type": "function",
      "constant": true
    }
]; 
// 🚨🚨 끝 🚨🚨

// --- 1. Wallet Connection and Contract Initialization ---
async function connectWallet() {
    if (typeof window.ethereum !== 'undefined') {
        web3 = new Web3(window.ethereum);
        try {
            // 사용자에게 MetaMask 연결 승인 요청
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            
            // 컨트랙트 객체 생성
            maintenanceContract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
            
            statusDiv.innerText = `✅ MetaMask Connected. Account: ${accounts[0].substring(0, 8)}...`;
            statusDiv.className = 'status-box success';
            
            simulationStatusDiv.innerText = 'Verify connection to BNB Testnet and select a CSV file.';

        } catch (error) {
            statusDiv.innerText = `❌ MetaMask Connection Failed: ${error.message}`;
            statusDiv.className = 'status-box error';
        }
    } else {
        statusDiv.innerText = '❌ Please install and connect MetaMask to your browser.';
        statusDiv.className = 'status-box error';
    }
}

// --- 2. Residual Value Chart Visualization ---
function drawResidualValueChart(data) {
    const ctx = document.getElementById('residualValueChart').getContext('2d');
    
    // CSV 데이터에서 날짜와 RV 값 추출
    const labels = data.map(row => row['Date']); 
    // RV 값에서 통화 기호나 콤마를 제거하고 숫자로 변환
    const residualValues = data.map(row => 
        parseFloat(String(row['RV (Residual Value) (USD)']).replace(/[$,]/g, ''))
    ); 

    // 기존 차트가 있으면 삭제
    if (residualValueChartInstance) {
        residualValueChartInstance.destroy();
    }

    // Chart.js를 사용하여 새 차트 생성
    residualValueChartInstance = new Chart(ctx, {
        type: 'line', 
        data: {
            labels: labels,
            datasets: [{
                label: 'Residual Value (USD)',
                data: residualValues,
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1,
                fill: false
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    title: { display: true, text: 'Date' }
                },
                y: {
                    title: { display: true, text: 'Residual Value (USD)' },
                    beginAtZero: false
                }
            }
        }
    });
}

// --- 3. 메인: CSV 업로드 및 블록체인 전송 ---
async function uploadMaintenanceRecords() {
    if (!maintenanceContract) {
        return alert("MetaMask connection and contract initialization are required.");
    }

    const fileInput = document.getElementById('csvFileInput');
    const file = fileInput.files[0];
    if (!file) return alert("Please select a CSV file.");

    simulationStatusDiv.innerText = 'Parsing data and generating chart...';
    simulationStatusDiv.className = 'status-box';

    // Papa Parse를 사용하여 파일 읽기
    Papa.parse(file, {
        header: true, 
        skipEmptyLines: true,
        complete: async function(results) {
            const records = results.data;
            
            // 1. 잔존 가치 그래프 시각화
            drawResidualValueChart(records);
            
            // 2. 블록체인 전송용 데이터 준비
            const recordsToSend = records.map(record => {
                const contents = JSON.stringify(record);
                // 컨트랙트 형식: [id=0, contents_string]
                return [0, contents]; 
            });
            
            // 3. 블록체인 트랜잭션 실행
            const accounts = await web3.eth.getAccounts();
            const adminAccount = accounts[0]; 

            simulationStatusDiv.innerText = `Sending ${recordsToSend.length} records to BNB Testnet. Please check the MetaMask window.`;

            try {
                const tx = await maintenanceContract.methods.recordMaintenance(recordsToSend)
                    .send({ 
                        from: adminAccount, 
                        gas: 20000000 // 배치 처리를 위한 충분한 가스 한도
                    });
                let firstRecordId = '0'; 
                    
                    if (tx.events && tx.events.RecordSaved && tx.events.RecordSaved.length > 0) {
                        // 배치 트랜잭션이 성공하면, 'RecordSaved' 이벤트가 기록 개수만큼 발생합니다.
                        // 첫 번째 이벤트 로그에서 'recordId' 값을 추출합니다.
                        // 만약 recordsToSend에 30개의 기록이 있었다면, tx.events.RecordSaved[0]은 ID 31번을 포함합니다.
                        firstRecordId = tx.events.RecordSaved[0].returnValues.recordId;
                    }
                    
                simulationStatusDiv.innerText = `✅ Simulation Success! ${recordsToSend.length} records written to block ${tx.blockNumber} (starting ID: ${firstRecordId}) `;
                simulationStatusDiv.className = 'status-box success';

            } catch (error) {
                simulationStatusDiv.innerText = `❌ Transaction Failed: ${error.message}. Verify that you are connected to the BNB Testnet and that the account has sufficient balance.`;
                simulationStatusDiv.className = 'status-box error';
                console.error(error);
            }
        },
        error: function(err) {
            simulationStatusDiv.innerText = `❌ CSV Parsing Error: ${err.message}`;
            simulationStatusDiv.className = 'status-box error';
        }
    });
}

// --- 4. 블록체인 기록 조회 함수 ---
async function searchRecord() {
    if (!maintenanceContract) {
        return alert("MetaMask connection is required.");
    }

    const recordId = document.getElementById('recordIdInput').value;
    const resultStatusDiv = document.getElementById('searchResultStatus');
    const displayArea = document.getElementById('recordDisplayArea');
    
    // 입력값 검증
    if (!recordId || recordId <= 0) {
        resultStatusDiv.innerText = "❌ Please enter a valid Record ID..";
        resultStatusDiv.className = 'status-box error';
        displayArea.innerHTML = '';
        return;
    }
    
    resultStatusDiv.innerText = `Retrieving Record ID ${recordId}...`;
    resultStatusDiv.className = 'status-box';
    displayArea.innerHTML = '';

    try {
        // 컨트랙트의 getMaintenanceRecord 함수 호출 (읽기 트랜잭션 - 가스비 0)
        const record = await maintenanceContract.methods.getMaintenanceRecord(recordId).call();

        if (record.contents === "") {
             // 컨트랙트가 ID 0 또는 존재하지 않는 ID에 대해 빈 값을 반환할 경우
            resultStatusDiv.innerText = `⚠️ Record ID ${recordId} not found.`;
            resultStatusDiv.className = 'status-box warning';
            return;
        }

        // 결과 표시를 위해 JSON 문자열을 객체로 변환
        const recordData = JSON.parse(record.contents);
        
        resultStatusDiv.innerText = `✅ Record ID ${recordId} successfully retrieved.`;
        resultStatusDiv.className = 'status-box success';
        
        // 데이터를 HTML 테이블 형태로 표시
        let htmlContent = '<table>';
        for (const key in recordData) {
            htmlContent += `<tr><th>${key}</th><td>${recordData[key]}</td></tr>`;
        }
        htmlContent += '</table>';
        
        displayArea.innerHTML = htmlContent;

    } catch (error) {
        resultStatusDiv.innerText = `❌ Retrieval Failed: ${error.message}`;
        resultStatusDiv.className = 'status-box error';
        console.error(error);
    }
}