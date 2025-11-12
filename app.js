// =========================================================================
// Global Variables and Constants
// =========================================================================
let web3;
let contract;
let chartInstance = null; // To store the Chart.js instance

// Deployed Contract Address (BNB Testnet)
const CONTRACT_ADDRESS = "0x790bAf11120bbc2005853793a737482C4e33cDBe"; 

// ABI for the Contract (includes only necessary functions)
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
            // Request account access
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
            updateStatus();
            
            // Listen for account or network changes
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
 * Updates the wallet connection status (account, balance, network).
 */
async function updateStatus() {
    if (!web3) return;

    const accounts = await web3.eth.getAccounts();
    const selectedAccount = accounts[0];
    const networkId = await web3.eth.net.getId();
    
    // Check for BNB Testnet (ID 97)
    if (networkId.toString() !== '97') {
            document.getElementById('networkStatus').innerHTML = `Network ID: <span class="text-red-500 font-bold">ERROR: Connect to BNB Testnet (ID 97)</span>`;
    } else {
        document.getElementById('networkStatus').textContent = `Network ID: 97 (BNB Testnet)`;
    }

    if (selectedAccount) {
        const balanceWei = await web3.eth.getBalance(selectedAccount);
        const balanceEth = web3.utils.fromWei(balanceWei, 'ether');
        document.getElementById('accountStatus').textContent = `Account: ${selectedAccount.substring(0, 6)}...${selectedAccount.substring(38)}`;
        document.getElementById('balanceStatus').textContent = `Balance: ${parseFloat(balanceEth).toFixed(4)} tBNB`;
        document.getElementById('recordButton').disabled = false;
    } else {
        document.getElementById('accountStatus').textContent = "Wallet Status: Account not selected.";
        document.getElementById('recordButton').disabled = true;
    }
}


// =========================================================================
// 1. IPFS Upload (Pinata Simulation)
// =========================================================================

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
                // Pinata requires custom headers for file upload
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

// =========================================================================
// 2. Blockchain Recording
// =========================================================================

/**
 * Records the IPFS hash (CID) onto the smart contract.
 * @param {string} ipfsFileHash - The CID of the uploaded file.
 * @returns {Promise<string>} The File ID (Record ID) generated by the contract.
 */
async function recordMaintenanceHistory(ipfsFileHash) {
    const accounts = await web3.eth.getAccounts();
    const adminAccount = accounts[0];
    
    document.getElementById('uploadStatus').textContent = `3. Recording Maintenance Data CID to Blockchain... (Admin: ${adminAccount.substring(0, 6)}...)`;

    try {
        const tx = await contract.methods.addFileHash(ipfsFileHash)
            .send({
                from: adminAccount
            });
        
        // Extract fileId (Record ID) from the event log
        const fileId = tx.events.FileHashRecorded.returnValues.fileId;

        document.getElementById('uploadStatus').innerHTML = `✅ **SUCCESS!** Maintenance Record CID recorded. (File ID: <span class="font-bold text-green-600">${fileId}</span>) <br>Tx Hash: ${tx.transactionHash.substring(0, 10)}...`;
        
        return fileId;

    } catch (error) {
        // IMPROVED ERROR HANDLING
        let errorMessage = "Blockchain recording failed.";
        
        // Check for specific error types (Insufficient funds, revert, etc.)
        if (error.message && error.message.includes("insufficient funds")) {
            errorMessage = "Blockchain Recording Failed: Insufficient tBNB balance for gas.";
        } else if (error.message && (error.message.includes("revert") || error.message.includes("denied"))) {
            errorMessage = "Blockchain Recording Failed: Transaction reverted. **Possible Admin/Permission issue** or contract logic error.";
        } else if (error.message && error.message.includes("User denied transaction signature")) {
            errorMessage = "Blockchain Recording Failed: Transaction was manually rejected by the user.";
        } else {
            errorMessage = `Blockchain Recording Failed: ${error.message.substring(0, 100)}...`;
        }

        document.getElementById('uploadStatus').textContent = `❌ ${errorMessage}`;
        console.error("Blockchain transaction error:", error);
        throw new Error("Blockchain recording failed.");
    }
}

// =========================================================================
// Upload Handler
// =========================================================================

/**
 * Main function to handle the entire upload and record process.
 */
async function handleUploadAndRecord() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const apiSecret = document.getElementById('apiSecret').value.trim();
    const fileInput = document.getElementById('fileInput'); 
    const file = fileInput.files[0];
    const button = document.getElementById('recordButton');

    if (!web3 || !contract) return alert("Please connect to MetaMask and ensure the BNB Testnet is selected.");
    if (!apiKey || !apiSecret) return alert("Please enter your Pinata API Key and Secret Key.");
    if (!file) return alert("Please select a CSV file containing maintenance data to upload.");

    button.disabled = true;
    button.textContent = "Processing...";
    document.getElementById('uploadStatus').textContent = "1. Starting upload process...";

    try {
        // 1. IPFS Upload
        document.getElementById('uploadStatus').textContent = "2. Uploading file to IPFS via Pinata...";
        const ipfsFileHash = await uploadToIPFS(file, apiKey, apiSecret);
        
        document.getElementById('uploadStatus').textContent = `2. IPFS Upload Success! CID: ${ipfsFileHash.substring(0, 10)}...`;

        // 2. Blockchain Record
        await recordMaintenanceHistory(ipfsFileHash);

    } catch (error) {
        console.error("Total process error:", error);
        // Display the detailed error from the failed step (IPFS or Blockchain)
        document.getElementById('uploadStatus').textContent = `❌ Total Process Failed: ${error.message}`;
    } finally {
        button.disabled = false;
        button.textContent = "Upload to IPFS and Record CID on Blockchain";
    }
}


// =========================================================================
// 3 & 4. Data Retrieval and Analysis
// =========================================================================

/**
 * Parses CSV text into an HTML table and extracts data for charting.
 * @param {string} csvText - The raw CSV content.
 * @returns {Array<{date: string, value: number}>} Data points for the chart.
 */
function csvToHtmlTable(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length === 0) return '<tr><td colspan="100%">No data found.</td></tr>';

    const table = document.createElement('table');
    const thead = table.createTHead();
    const tbody = table.createTBody();

    // 1. Parse Headers (First Line)
    const headers = lines[0].split(',');
    const headerRow = thead.insertRow();
    headers.forEach(header => {
        const th = document.createElement('th');
        // Clean headers of quotes and whitespace
        th.textContent = header.trim().replace(/"/g, ''); 
        headerRow.appendChild(th);
    });

    // 2. Parse Body and Extract Chart Data
    const dataForChart = [];
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '') continue;
        const cells = lines[i].split(',');
        const row = tbody.insertRow();

        let date, residualValue;

        cells.forEach((cell, index) => {
            const td = row.insertCell();
            const value = cell.trim().replace(/"/g, '');
            td.textContent = value;
            
            // Heuristic check for relevant columns
            const headerName = headers[index].trim().toLowerCase();
            if (headerName.includes('date') || headerName.includes('inspection')) { 
                date = value;
            }
            if (headerName.includes('residual') || headerName.includes('잔존가치')) { 
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
        // Using a proxy is often necessary to avoid CORS issues when fetching external IPFS content
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(gatewayUrl)}`;
        
        const response = await fetch(proxyUrl);

        if (!response.ok) {
            throw new Error(`Failed to fetch CSV data from IPFS! HTTP Status: ${response.status}`);
        }

        const csvText = await response.text();
        
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
// Initialization
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    initWeb3();
    document.getElementById('recordButton').disabled = true; // Disable until MetaMask is connected
    setActiveTab('upload'); // Set default tab (now calls the globally defined function)
});

// Note: Functions defined globally (without 'const' or 'let' and outside a module) 
// are automatically attached to the 'window' object and are visible to HTML onclick handlers.
