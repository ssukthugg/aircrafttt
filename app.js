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

// --- 1. 지갑 연결 및 컨트랙트 초기화 ---
async function connectWallet() {
    if (typeof window.ethereum !== 'undefined') {
        web3 = new Web3(window.ethereum);
        try {
            // 사용자에게 MetaMask 연결 승인 요청
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            
            // 컨트랙트 객체 생성
            maintenanceContract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
            
            statusDiv.innerText = `✅ MetaMask 연결 성공. 계정: ${accounts[0].substring(0, 8)}...`;
            statusDiv.className = 'status-box success';
            
            // Ganache가 켜져 있는지 확인하는 메시지 추가
            simulationStatusDiv.innerText = 'Ganache를 실행하고 CSV 파일을 선택해주세요.';

        } catch (error) {
            statusDiv.innerText = `❌ MetaMask 연결 실패: ${error.message}`;
            statusDiv.className = 'status-box error';
        }
    } else {
        statusDiv.innerText = '❌ MetaMask를 설치하여 브라우저에 연결해주세요.';
        statusDiv.className = 'status-box error';
    }
}

// --- 2. 잔존 가치 그래프 시각화 함수 ---
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
        return alert("MetaMask 연결 및 컨트랙트 초기화가 완료되지 않았습니다.");
    }

    const fileInput = document.getElementById('csvFileInput');
    const file = fileInput.files[0];
    if (!file) return alert("CSV 파일을 선택해주세요.");

    simulationStatusDiv.innerText = '데이터 파싱 및 그래프 생성 중...';
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

            simulationStatusDiv.innerText = `총 ${recordsToSend.length}개 기록을 Ganache에 전송 중입니다. MetaMask 창을 확인해주세요.`;

            try {
                const tx = await maintenanceContract.methods.recordMaintenance(recordsToSend)
                    .send({ 
                        from: adminAccount, 
                        gas: 80000000 // 배치 처리를 위한 충분한 가스 한도
                    });

                simulationStatusDiv.innerText = `✅ 시뮬레이션 성공! ${recordsToSend.length}개 기록이 블록 ${tx.blockNumber}에 기록되었습니다.`;
                simulationStatusDiv.className = 'status-box success';

            } catch (error) {
                simulationStatusDiv.innerText = `❌ 트랜잭션 실패: ${error.message}. Ganache가 켜져 있는지, 해당 계정(MetaMask)이 Ganache 계정인지 확인하세요.`;
                simulationStatusDiv.className = 'status-box error';
                console.error(error);
            }
        },
        error: function(err) {
            simulationStatusDiv.innerText = `❌ CSV 파싱 에러: ${err.message}`;
            simulationStatusDiv.className = 'status-box error';
        }
    });
}