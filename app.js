// =========================================================================
// Global Variables and Constants
// =========================================================================
let web3;
let contract;
let chartInstance = null; // To store the Chart.js instance
let lastIpfsHash = ""; // NEW: Stores the CID after successful IPFS upload

// Deployed Contract Address (BNB Testnet)
// !!! 이 주소를 새롭게 배포된 컨트랙트 주소로 업데이트해야 합니다 !!!
// (재배포 후, Truffle 출력의 'contract address'를 여기에 붙여넣으세요)
const CONTRACT_ADDRESS = "0xf0Ac7007BCf7b9aaDE8fFc261937c4f56228d442"; 

// ABI for the Contract (includes only necessary functions)
// !!! 솔리디티 컨트랙트의 인터페이스(함수, 이벤트)가 변경되었다면, 
// !!! Truffle이 생성한 JSON 파일에서 이 CONTRACT_ABI 배열을 통째로 복사해서 붙여넣으세요.
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
          "name": "fileId",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "string",
          "name": "ipfsHash",
          "type": "string"
        }
      ],
      "name": "FileHashRecorded",
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
      "name": "fileHashes",
      "outputs": [
        {
          "internalType": "string",
          "name": "",
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
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "name": "isAdmin",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function",
      "constant": true
    },
    {
      "inputs": [
        {
          "internalType": "string",
          "name": "_ipfsHash",
          "type": "string"
        }
      ],
      "name": "addFileHash",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_fileId",
          "type": "uint256"
        }
      ],
      "name": "getFileHash",
      "outputs": [
        {
          "internalType": "string",
          "name": "",
          "type": "string"
        }
      ],
      "stateMutability": "view",
      "type": "function",
      "constant": true
    }
];

const PINATA_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';


// =========================================================================
// UI Functions (Defined as global functions for HTML onclick stability)
// =========================================================================

/**
 * Sets the active tab view.
 * @param {string} tabName - The name of the tab (e.g., 'upload', 'view').
 */
function setActiveTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-button').forEach(el => {
        el.classList.remove('border-blue-600', 'text-blue-600');
        el.classList.add('text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
    });

    document.getElementById(`content${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`).classList.remove('hidden');
    const activeTabButton = document.getElementById(`tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
    activeTabButton.classList.add('border-blue-600', 'text-blue-600');
    activeTabButton.classList.remove('text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
}

/**
 * Handles the IPFS Upload step.
 */
async function handleIpfsUpload() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const apiSecret = document.getElementById('apiSecret').value.trim();
    const fileInput = document.getElementById('fileInput'); 
    const file = fileInput.files[0];
    const button = document.getElementById('ipfsUploadButton');
    const recordButton = document.getElementById('recordOnlyButton');

    if (!web3 || !contract) return alert("Please connect to MetaMask and ensure the BNB Testnet is selected.");
    if (!apiKey || !apiSecret) return alert("Please enter your Pinata API Key and Secret Key.");
    if (!file) return alert("Please select a CSV file containing maintenance data to upload.");

    button.disabled = true;
    recordButton.disabled = true;
    button.textContent = "1. Uploading to IPFS...";
    document.getElementById('uploadStatus').textContent = "Status: 1. Starting IPFS upload process...";
    
    try {
        // 1. IPFS Upload
        const ipfsFileHash = await uploadToIPFS(file, apiKey, apiSecret);
        
        // Success
        lastIpfsHash = ipfsFileHash; // Store the hash
        document.getElementById('uploadStatus').innerHTML = `✅ **IPFS Upload Success!** CID: ${ipfsFileHash.substring(0, 10)}...`;
        document.getElementById('ipfsHashDisplay').classList.remove('hidden');
        document.getElementById('ipfsHashDisplay').innerHTML = `Last Uploaded CID: ${ipfsFileHash}`;

        // Enable the next step only if the user is an Admin
        const accounts = await web3.eth.getAccounts();
        const isAdminUser = await contract.methods.isAdmin(accounts[0]).call();

        if (isAdminUser) {
            recordButton.disabled = false;
            recordButton.textContent = "2. Record CID on Blockchain (Ready)";
        } else {
            document.getElementById('uploadStatus').innerHTML += `<br><span class="text-red-500">❌ Error: Only Admin can proceed to Blockchain Recording.</span>`;
        }

    } catch (error) {
        lastIpfsHash = ""; // Clear hash on failure
        document.getElementById('ipfsHashDisplay').classList.add('hidden');
        document.getElementById('uploadStatus').textContent = `❌ IPFS Upload Failed: ${error.message}`;
        console.error("IPFS Upload Error:", error);
    } finally {
        button.disabled = false;
        button.textContent = "1. Upload File to IPFS";
    }
}

/**
 * Records the stored IPFS hash (CID) onto the smart contract.
 * Uses lastIpfsHash global variable.
 */
async function handleRecordOnly() {
    const recordButton = document.getElementById('recordOnlyButton');
    
    if (!lastIpfsHash) return alert("Please upload a file to IPFS first (Step 1).");
    
    recordButton.disabled = true;
    recordButton.textContent = "2. Recording to Blockchain...";
    document.getElementById('uploadStatus').textContent = `Status: 2. Recording Maintenance Data CID to Blockchain...`;

    const accounts = await web3.eth.getAccounts();
    const senderAccount = accounts[0]; 

    try {
        const tx = await contract.methods.addFileHash(lastIpfsHash)
            .send({
                from: senderAccount
            });
        
        // Extract fileId (Record ID) from the event log
        const fileId = tx.events.FileHashRecorded.returnValues.fileId;

        document.getElementById('uploadStatus').innerHTML = `✅ **SUCCESS!** Maintenance Record CID recorded. (File ID: <span class="font-bold text-green-600">${fileId}</span>) <br>Tx Hash: ${tx.transactionHash.substring(0, 10)}...`;
        
        // Clear state after success
        lastIpfsHash = "";
        document.getElementById('ipfsHashDisplay').classList.add('hidden');

    } catch (error) {
        let errorMessage = "Blockchain recording failed.";
        
        if (error.message && error.message.includes("insufficient funds")) {
            errorMessage = "Blockchain Recording Failed: Insufficient tBNB balance for gas.";
        } else if (error.message && (error.message.includes("revert") || error.message.includes("denied") || error.message.includes("Only admin"))) {
            // This captures the Checksum/Admin issue
            errorMessage = "Blockchain Recording Failed: Transaction reverted. **Possible Admin/Permission issue (Checksum Mismatch)** or contract logic error.";
        } else if (error.message && error.message.includes("User denied transaction signature")) {
            errorMessage = "Blockchain Recording Failed: Transaction was manually rejected by the user.";
        } else {
            errorMessage = `Blockchain Recording Failed: ${error.message.substring(0, 100)}...`;
        }

        document.getElementById('uploadStatus').textContent = `❌ ${errorMessage}`;
        console.error("Blockchain transaction error:", error);
    } finally {
        recordButton.disabled = false;
        recordButton.textContent = "2. Record CID on Blockchain";
        updateStatus(); // Re-check status to potentially disable/enable buttons based on new state
    }
}

/**
 * Main function to retrieve the record, fetch data from IPFS, and visualize it.
 */
async function viewRecordAndAnalyze() {
    if (!web3 || !contract) return alert("Please connect to MetaMask and ensure the BNB Testnet is selected.");

    const fileId = document.getElementById('recordIdInput').value;
    const viewButton = document.getElementById('viewButton');
    const statusDiv = document.getElementById('viewStatus');
    
    if (!fileId || isNaN(fileId) || fileId <= 0) {
        statusDiv.textContent = "Please enter a valid Maintenance Record ID (e.g., 1).";
        return;
    }

    viewButton.disabled = true;
    viewButton.textContent = "Searching...";
    statusDiv.textContent = `1. Querying Blockchain for Maintenance Record ID ${fileId}...`;
    
    try {
        // 1. Retrieve CID from Blockchain
        const ipfsHash = await contract.methods.getFileHash(fileId).call();
        
        if (ipfsHash.length === 0 || ipfsHash === '0x') {
            throw new Error(`Maintenance Record ID ${fileId} not found on the blockchain. The record may not exist or the ID is invalid.`);
        }

        statusDiv.textContent = `2. CID Found: ${ipfsHash.substring(0, 10)}... Fetching data from IPFS Gateway...`;

        // 2. Fetch CSV data from IPFS Gateway
        const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;
        
        const response = await fetch(gatewayUrl); 
        
        if (!response.ok) {
            throw new Error(`Failed to fetch CSV data from IPFS! HTTP Status: ${response.status}`);
        }

        const csvText = await response.text();
        
        // --- CRITICAL DEBUGGING LOG ---
        console.log("--- RAW DATA RETRIEVED FROM IPFS GATEWAY ---");
        console.log(csvText.substring(0, 500) + (csvText.length > 500 ? '...' : ''));
        console.log("-------------------------------------------");
        // ------------------------------
        
        if (csvText.length === 0) {
             throw new Error("Retrieved data is empty. Check the file content on Pinata and the gateway status.");
        }
        
        // 3. Parse CSV and extract data for table/chart
        const dataForChart = csvToHtmlTable(csvText);
        
        // 4. Render Chart
        renderResidualValueChart(dataForChart);

        statusDiv.innerHTML = `✅ **SUCCESS!** Data retrieved and analyzed. CID: <a href="${gatewayUrl}" target="_blank" class="text-blue-600 underline">${ipfsHash}</a>`;

    } catch (error) {
        document.getElementById('dataTable').innerHTML = `<p class="p-4 text-red-500">Error: Failed to retrieve or process data.</p>`;
        statusDiv.textContent = `❌ Error: ${error.message}`;
        console.error("View/Analyze Error:", error);
    } finally {
        viewButton.disabled = false;
        viewButton.textContent = "Retrieve Record and Start Analysis";
    }
}


// =========================================================================
// Web3 and Wallet Connection
// =========================================================================

/**
 * Initializes Web3 and connects to MetaMask.
 */
async function initWeb3() {
    if (window.ethereum) {
        web3 = new Web3(window.ethereum);
        try {
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
            updateStatus();
            
            window.ethereum.on('accountsChanged', updateStatus);
            window.ethereum.on('chainChanged', () => { window.location.reload(); });

        } catch (error) {
            console.error("MetaMask connection failed:", error);
            document.getElementById('accountStatus').textContent = "Wallet Status: Connection Failed (Check MetaMask)";
        }
    } else {
        document.getElementById('accountStatus').textContent = "Wallet Status: Please install MetaMask!";
    }
}

/**
 * Updates the wallet connection status and checks if the connected user is Admin.
 */
async function updateStatus() {
    if (!web3 || !contract) return;

    const accounts = await web3.eth.getAccounts();
    const selectedAccount = accounts[0];
    const networkId = await web3.eth.net.getId();
    
    // Check for BNB Testnet (ID 97)
    if (networkId.toString() !== '97') {
            document.getElementById('networkStatus').innerHTML = `Network ID: <span class="text-red-500 font-bold">ERROR: Connect to BNB Testnet (ID 97)</span>`;
    } else {
        document.getElementById('networkStatus').textContent = `Network ID: 97 (BNB Testnet)`;
    }
    
    // Admin Status Check
    let adminStatus = "Checking Admin status...";
    let isAdminUser = false;
    
    if (selectedAccount) {
        try {
            // Check if the connected account is an Admin (uses the new mapping function)
            isAdminUser = await contract.methods.isAdmin(selectedAccount).call();
            if (isAdminUser) {
                adminStatus = '<span class="text-green-600 font-bold">✅ Admin (Permission Granted)</span>';
            } else {
                adminStatus = '<span class="text-red-600 font-bold">❌ Not Admin (Transaction will fail)</span>';
            }
        } catch(error) {
            console.error("Admin check failed:", error);
            adminStatus = '<span class="text-red-600 font-bold">❌ Admin Check Failed (Invalid Contract Address?)</span>';
        }
    }


    if (selectedAccount) {
        const balanceWei = await web3.eth.getBalance(selectedAccount);
        const balanceEth = web3.utils.fromWei(balanceWei, 'ether');
        
        document.getElementById('accountStatus').innerHTML = `Account (Connected): ${selectedAccount} <br>Admin Status: ${adminStatus}`;
        document.getElementById('balanceStatus').textContent = `Balance: ${parseFloat(balanceEth).toFixed(4)} tBNB`;
        
        // Only enable IPFS upload button if there is an account
        document.getElementById('ipfsUploadButton').disabled = !selectedAccount;
        
        // If there's a pending CID, enable the record button if they are an admin.
        if (lastIpfsHash && isAdminUser) {
             document.getElementById('recordOnlyButton').disabled = false;
             document.getElementById('recordOnlyButton').textContent = "2. Record CID on Blockchain (Ready)";
        }

    } else {
        document.getElementById('accountStatus').textContent = "Wallet Status: Account not selected.";
        document.getElementById('ipfsUploadButton').disabled = true;
        document.getElementById('recordOnlyButton').disabled = true;
    }
}


/**
 * Uploads the file to IPFS via Pinata service.
 * @param {File} file - The file to upload.
 * @param {string} apiKey - Pinata API Key.
 * @param {string} apiSecret - Pinata Secret Key.
 * @returns {Promise<string>} The IPFS Content Identifier (CID).
 */
async function uploadToIPFS(file, apiKey, apiSecret) {
    const formData = new FormData();
    formData.append('file', file);
    
    const pinataMetadata = JSON.stringify({ name: file.name });
    formData.append('pinataMetadata', pinataMetadata);

    try {
        const response = await fetch(PINATA_URL, {
            method: 'POST',
            headers: {
                'pinata_api_key': apiKey,
                'pinata_secret_api_key': apiSecret
            },
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error('Pinata API Error: ' + response.status + ' - ' + errorText.substring(0, 100) + '...');
        }
        
        const json = await response.json();
        return json.IpfsHash; // Return the CID
        
    } catch (error) {
        console.error("IPFS Upload Error:", error);
        throw new Error("Failed to upload file to IPFS: Check Pinata API Keys and permissions.");
    }
}

/**
 * Parses CSV text into an HTML table and extracts data for charting.
 * @param {string} csvText - The raw CSV content.
 * @returns {Array<{date: string, value: number}>} Data points for the chart.
 */
function csvToHtmlTable(csvText) {
    // --- CRITICAL DEBUGGING CHECK ---
    if (!csvText || typeof csvText !== 'string' || csvText.trim().length === 0) {
        console.error("CSV Parsing Error: Input text is not a valid string or is empty.");
        throw new Error("CSV Parsing failed: Retrieved data is empty or malformed.");
    }
    // --------------------------------
    
    // Regex to split CSV by comma, but ignore commas inside double quotes.
    // This is required because fields like "Value, with comma" break simple .split(',')
    const CSV_SPLIT_REGEX = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;

    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length === 0 || lines.every(line => line.trim() === '')) return '<tr><td colspan="100%">No data found.</td></tr>';

    const table = document.createElement('table');
    const thead = table.createTHead();
    const tbody = table.createTBody();

    // 1. Parse Headers (First Line)
    const headers = lines[0].split(CSV_SPLIT_REGEX);
    const headerRow = thead.insertRow();
    headers.forEach(header => {
        const th = document.createElement('th');
        // Clean headers of quotes and whitespace
        const headerValue = (header || '').trim().replace(/"/g, ''); 
        th.textContent = headerValue; 
        headerRow.appendChild(th);
    });

    // 2. Parse Body and Extract Chart Data
    const dataForChart = [];
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '') continue;
        
        // --- FIX APPLIED HERE: Use RegEx Split to ignore commas inside quoted fields ---
        const cells = lines[i].split(CSV_SPLIT_REGEX); 
        // --------------------------------------------------------------------------
        
        const row = tbody.insertRow();

        let date, residualValue;

        cells.forEach((cell, index) => {
            const td = row.insertCell();
            
            // Ensure 'cell' is not undefined before calling trim(), and remove surrounding quotes
            const value = (cell || '').trim().replace(/"/g, '');
            
            td.textContent = value;
            
            // Heuristic check for relevant columns
            const headerName = (headers[index] || '').trim().toLowerCase();
            if (headerName.includes('date') || headerName.includes('inspection')) { 
                date = value;
            }
            if (headerName.includes('residual') || headerName.includes('rv') || headerName.includes('value')) { 
                // Enhanced cleaning for numerical values, removing non-digit/non-dot characters
                residualValue = parseFloat(value.replace(/[^0-9.]/g, ''));
            }
        });
        
        if (date && !isNaN(residualValue)) {
            dataForChart.push({ date: date, value: residualValue });
        }
    }

    document.getElementById('dataTable').innerHTML = '';
    document.getElementById('dataTable').appendChild(table);
    
    return dataForChart;
}

/**
 * Renders the Chart.js line graph for residual value trend.
 * @param {Array<{date: string, value: number}>} data - The data points.
 */
function renderResidualValueChart(data) {
    const ctx = document.getElementById('residualValueChart').getContext('2d');

    if (chartInstance) {
        chartInstance.destroy();
    }
    
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(item => item.date),
            datasets: [{
                label: 'Residual Value (USD)',
                data: data.map(item => item.value),
                backgroundColor: 'rgba(79, 70, 229, 0.5)',
                borderColor: 'rgb(79, 70, 229)',
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top' },
                title: { display: true, text: 'Aircraft Residual Value Trend Over Time' }
            },
            scales: {
                y: { beginAtZero: false, title: { display: true, text: 'Residual Value (USD)' } },
                x: { title: { display: true, text: 'Date of Maintenance/Inspection' } }
            }
        }
    });
}


// =========================================================================
// Initialization
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    initWeb3();
    document.getElementById('ipfsUploadButton').disabled = true; // Disable until MetaMask is connected
    document.getElementById('recordOnlyButton').disabled = true;
    setActiveTab('upload'); 
});