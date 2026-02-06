// =========================================================================
// Global Variables and Constants
// =========================================================================
let web3;
let contract;
let chartInstance = null;
let lastIpfsHash = "";

// 컨트랙트 주소 및 ABI 설정
const CONTRACT_ADDRESS = "0xf0Ac7007BCf7b9aaDE8fFc261937c4f56228d442"; 
const PINATA_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

const CONTRACT_ABI = [
    {
      "inputs": [{ "internalType": "address[]", "name": "_admins", "type": "address[]" }],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": false, "internalType": "uint256", "name": "fileId", "type": "uint256" },
        { "indexed": false, "internalType": "string", "name": "ipfsHash", "type": "string" }
      ],
      "name": "FileHashRecorded",
      "type": "event"
    },
    {
      "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "name": "fileHashes",
      "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
      "stateMutability": "view",
      "type": "function",
      "constant": true
    },
    {
      "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
      "name": "isAdmin",
      "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
      "stateMutability": "view",
      "type": "function",
      "constant": true
    },
    {
      "inputs": [{ "internalType": "string", "name": "_ipfsHash", "type": "string" }],
      "name": "addFileHash",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "uint256", "name": "_fileId", "type": "uint256" }],
      "name": "getFileHash",
      "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
      "stateMutability": "view",
      "type": "function",
      "constant": true
    }
];

// 기종별 감가상각 파라미터
const AIRCRAFT_PARAMS = {
    "B787": { initialPrice: 190000000, permDepr: 1185.36, varDepr: 2406.64, annualEconRate: 0.04 },
    "B737 NG": { initialPrice: 80000000, permDepr: 715.61, varDepr: 1452.90, annualEconRate: 0.04 },
    "A320": { initialPrice: 77000000, permDepr: 796.79, varDepr: 1617.72, annualEconRate: 0.04 },
    "B777": { initialPrice: 140000000, permDepr: 1568.66, varDepr: 3184.85, annualEconRate: 0.04 },
    "A330": { initialPrice: 175000000, permDepr: 1291.46, varDepr: 2622.05, annualEconRate: 0.04 },
    "B767": { initialPrice: 150000000, permDepr: 1101.38, varDepr: 2236.13, annualEconRate: 0.04 },
    "DEFAULT": { initialPrice: 80000000, permDepr: 700.00, varDepr: 1400.00, annualEconRate: 0.04 }
};

// =========================================================================
// RV Calculation Core Logic
// =========================================================================

function detectModel(filename) {
    const upperName = filename.toUpperCase();
    if (upperName.includes("B787")) return "B787";
    if (upperName.includes("B737")) return "B737 NG";
    if (upperName.includes("A320")) return "A320";
    if (upperName.includes("B777")) return "B777";
    if (upperName.includes("A330")) return "A330";
    if (upperName.includes("B767")) return "B767";
    return "DEFAULT";
}

async function handleFileUploadAndRecord() {
    const fileInput = document.getElementById('maintenanceFile');
    const pinataKey = document.getElementById('pinataApiKey').value;
    const pinataSecret = document.getElementById('pinataApiSecret').value;

    if (!fileInput.files[0] || !pinataKey || !pinataSecret) {
        return alert("Please provide CSV file and Pinata Keys.");
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
        const csvText = e.target.result;
        const modelKey = detectModel(file.name);
        const params = AIRCRAFT_PARAMS[modelKey];
        
        // 1. RV & MR 로컬 계산
        const processedData = calculateRVLocally(csvText, params);
        
        // 2. IPFS 업로드를 위해 다시 CSV로 변환
        const newCsvContent = jsonToCsv(processedData);
        const processedFile = new File([newCsvContent], `PROCESSED_${file.name}`, { type: 'text/csv' });

        try {
            showStatus("IPFS에 처리된 데이터 업로드 중...", "blue");
            const cid = await uploadToIPFS(processedFile, pinataKey, pinataSecret);
            lastIpfsHash = cid;
            
            showStatus(`IPFS 업로드 성공: ${cid.substring(0, 15)}... 블록체인 기록 중...`, "blue");
            
            const accounts = await web3.eth.getAccounts();
            // addFileHash 호출 시 트랜잭션 결과에서 생성된 ID를 확인
            const receipt = await contract.methods.addFileHash(cid).send({ from: accounts[0] });
            
            // 이벤트 로그에서 신규 생성된 ID 추출 (배열 인덱스)
            const newId = receipt.events.FileHashRecorded.returnValues.fileId;
            
            showStatus(`✅ 성공! 신규 기록 ID: ${newId} (Model: ${modelKey})`, "green");
            renderUI(processedData);
        } catch (err) {
            showStatus(`오류 발생: ${err.message}`, "red");
        }
    };
    reader.readAsText(file);
}

function calculateRVLocally(csvText, params) {
    const lines = csvText.trim().split(/\r?\n/);
    const headers = lines[0].split(',');
    
    // 컬럼 매핑
    const idx = {
        date: headers.findIndex(h => h.toLowerCase().includes('date')),
        tis: headers.findIndex(h => h.toLowerCase().includes('tis')),
        work: headers.findIndex(h => h.toLowerCase().includes('work type'))
    };

    let currentRV = params.initialPrice;
    let accumulatedMR = 0;
    let lastTis = 0;
    let startDate = null;

    const result = [];

    for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(',');
        if (cells.length < 3) continue;

        const dateStr = cells[idx.date];
        const currentTis = parseFloat(cells[idx.tis]) || 0;
        const workType = cells[idx.work] || "";
        const currentDate = new Date(dateStr);

        if (i === 1) startDate = currentDate;

        // A. TIS 기반 감가상각
        const deltaTis = currentTis - lastTis;
        const permDeprAmt = deltaTis * params.permDepr;
        const varDeprAmt = deltaTis * params.varDepr;

        // B. 시간 기반 경제적 감가상각 (연 2000시간 가동 기준 정규화)
        const yearsPassed = (currentDate - startDate) / (1000 * 60 * 60 * 24 * 365);
        const econDeprAmt = (params.initialPrice * params.annualEconRate) * (deltaTis / 2000); 

        // 가치 업데이트
        currentRV -= (permDeprAmt + econDeprAmt);
        accumulatedMR += varDeprAmt;

        // C. Major Check 로직 (가치 회복 및 MR 리셋)
        let note = "";
        if (workType.includes('B-Check') || workType.includes('C-Check') || workType.includes('D-Check')) {
            currentRV += accumulatedMR;
            note = `Recaptured $${accumulatedMR.toFixed(0)} MR`;
            accumulatedMR = 0;
        }

        result.push({
            date: dateStr,
            tis: currentTis,
            workType: workType,
            rv: currentRV,
            mr: accumulatedMR,
            note: note
        });

        lastTis = currentTis;
    }
    return result;
}

// =========================================================================
// Blockchain & IPFS Helpers
// =========================================================================

async function searchBlockchain() {
    const id = document.getElementById('searchFileId').value;
    const statusDiv = document.getElementById('searchResult');
    
    if (id === "") return alert("검색할 ID를 입력하세요.");

    try {
        showStatus("블록체인 데이터 조회 중...", "blue");
        
        // getFileHash 호출 전, 에러를 방지하기 위해 call()로 먼저 확인 시도
        const cid = await contract.methods.getFileHash(id).call();
        
        if (!cid || cid === "") {
            throw new Error("해당 ID에 저장된 데이터가 없습니다.");
        }
        
        statusDiv.classList.remove('hidden');
        statusDiv.innerHTML = `
            <div class="p-3 bg-blue-50 border border-blue-200 rounded">
                <p class="text-sm font-semibold text-blue-800">조회 성공! IPFS CID:</p>
                <a href="https://gateway.pinata.cloud/ipfs/${cid}" target="_blank" class="text-xs text-blue-600 underline break-all">${cid}</a>
            </div>
        `;
        
        // IPFS에서 데이터 가져와서 차트 렌더링
        const response = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
        if (!response.ok) throw new Error("IPFS에서 파일을 가져오지 못했습니다.");
        
        const csvText = await response.text();
        const data = parseProcessedCsv(csvText);
        renderUI(data);
        showStatus("데이터 로드 완료", "green");
        
    } catch (e) {
        console.error(e);
        // 사용자에게 친숙한 에러 메시지 제공
        let errorMsg = e.message;
        if (errorMsg.includes("reverted")) {
            errorMsg = "존재하지 않는 ID입니다. (블록체인 인덱스 범위를 확인하세요)";
        }
        showStatus(`조회 실패: ${errorMsg}`, "red");
    }
}

async function uploadToIPFS(file, key, secret) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(PINATA_URL, {
        method: 'POST',
        headers: { 'pinata_api_key': key, 'pinata_secret_api_key': secret },
        body: formData
    });
    if (!response.ok) throw new Error("Pinata API 호출 실패");
    const json = await response.json();
    return json.IpfsHash;
}

// =========================================================================
// UI & Visualization
// =========================================================================

function renderUI(data) {
    const resultsArea = document.getElementById('resultsArea');
    resultsArea.classList.remove('hidden');

    // 1. 테이블 렌더링
    let html = `<table class="min-w-full text-sm"><thead><tr class="bg-gray-100 border-b">
        <th class="p-2 text-left">Date</th><th class="p-2 text-left">TIS</th>
        <th class="p-2 text-left">RV (USD)</th><th class="p-2 text-left">MR Balance</th>
        <th class="p-2 text-left">Event</th></tr></thead><tbody>`;
    
    data.forEach(row => {
        html += `<tr class="border-b hover:bg-gray-50">
            <td class="p-2">${row.date}</td><td class="p-2">${row.tis}</td>
            <td class="p-2 font-bold text-blue-700">$${row.rv.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
            <td class="p-2 text-red-600">$${row.mr.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
            <td class="p-2 text-xs italic text-green-600">${row.note}</td>
        </tr>`;
    });
    html += "</tbody></table>";
    document.getElementById('tableContainer').innerHTML = html;

    // 2. 차트 렌더링
    const ctx = document.getElementById('rvChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.date),
            datasets: [{
                label: 'Residual Value (RV)',
                data: data.map(d => d.rv),
                borderColor: '#1e40af',
                backgroundColor: 'rgba(30, 64, 175, 0.1)',
                tension: 0.2,
                fill: true
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' }
            }
        }
    });
}

function jsonToCsv(json) {
    if (json.length === 0) return "";
    const headers = Object.keys(json[0]).join(",");
    const rows = json.map(row => Object.values(row).join(","));
    return [headers, ...rows].join("\n");
}

function parseProcessedCsv(csv) {
    const lines = csv.trim().split("\n");
    return lines.slice(1).map(line => {
        const values = line.split(",");
        return {
            date: values[0],
            tis: parseFloat(values[1]),
            workType: values[2],
            rv: parseFloat(values[3]),
            mr: parseFloat(values[4]),
            note: values[5] || ""
        };
    });
}

function showStatus(msg, color) {
    const el = document.getElementById('statusMessage');
    el.classList.remove('hidden', 'bg-blue-100', 'bg-green-100', 'bg-red-100', 'text-blue-800', 'text-green-800', 'text-red-800');
    el.classList.add(`bg-${color}-100`, `text-${color}-800`);
    el.textContent = msg;
}

async function initWeb3() {
    if (window.ethereum) {
        try {
            web3 = new Web3(window.ethereum);
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
            const accounts = await web3.eth.getAccounts();
            document.getElementById('walletAddress').textContent = accounts[0].substring(0, 15) + "...";
        } catch (error) {
            console.error("User denied account access");
        }
    } else {
        showStatus("MetaMask를 설치해주세요!", "red");
    }
}

document.addEventListener('DOMContentLoaded', initWeb3);
