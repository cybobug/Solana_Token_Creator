// Global variables
let wallet = null;
let connection = null;
const DEVNET_ENDPOINT = 'https://api.devnet.solana.com';

// DOM Elements
const connectWalletBtn = document.getElementById('connectWalletBtn');
const disconnectWalletBtn = document.getElementById('disconnectWalletBtn');
const walletInfo = document.getElementById('walletInfo');
const walletAddress = document.getElementById('walletAddress');
const walletBalance = document.getElementById('walletBalance');
const copyAddressBtn = document.getElementById('copyAddressBtn');
const refreshBalanceBtn = document.getElementById('refreshBalanceBtn');
const createTokenBtn = document.getElementById('createTokenBtn');
const mintTokenBtn = document.getElementById('mintTokenBtn');
const sendTokenBtn = document.getElementById('sendTokenBtn');
const tokenList = document.getElementById('tokenList');
const transactionList = document.getElementById('transactionList');
const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
const notification = document.getElementById('notification');
const notificationText = document.getElementById('notificationText');
const closeNotification = document.getElementById('closeNotification');
const loadingIndicator = document.getElementById('loadingIndicator');
const loadingText = document.getElementById('loadingText');

// Initialize app when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeSolanaConnection();
    setupEventListeners();
    checkForWalletConnection();
});

// Initialize Solana connection
function initializeSolanaConnection() {
    connection = new solanaWeb3.Connection(DEVNET_ENDPOINT, 'confirmed');
    console.log('Connected to Solana devnet');
}

// Setup all event listeners
function setupEventListeners() {
    connectWalletBtn.addEventListener('click', connectWallet);
    disconnectWalletBtn.addEventListener('click', disconnectWallet);
    copyAddressBtn.addEventListener('click', copyWalletAddress);
    refreshBalanceBtn.addEventListener('click', refreshWalletBalance);
    createTokenBtn.addEventListener('click', createToken);
    mintTokenBtn.addEventListener('click', mintToken);
    sendTokenBtn.addEventListener('click', sendToken);
    refreshHistoryBtn.addEventListener('click', fetchTransactionHistory);
    closeNotification.addEventListener('click', hideNotification);
}

// Check if wallet is already connected
async function checkForWalletConnection() {
    if (window.solana && window.solana.isPhantom) {
        try {
            const response = await window.solana.connect({ onlyIfTrusted: true });
            handleWalletConnection(response);
        } catch (error) {
            console.log('Auto-connect error:', error.message);
        }
    } else {
        showNotification('Please install Phantom or Solflare wallet extension', 'warning');
    }
}

// Connect wallet
async function connectWallet() {
    try {
        showLoading('Connecting wallet...');
        
        if (!window.solana) {
            throw new Error('No Solana wallet found. Please install Phantom or Solflare');
        }
        
        const response = await window.solana.connect();
        handleWalletConnection(response);
        hideLoading();
        showNotification('Wallet connected successfully', 'success');
    } catch (error) {
        hideLoading();
        showNotification(`Error connecting wallet: ${error.message}`, 'error');
        console.error('Wallet connection error:', error);
    }
}

// Handle successful wallet connection
function handleWalletConnection(response) {
    wallet = response;
    walletAddress.textContent = shortenAddress(wallet.publicKey.toString());
    connectWalletBtn.style.display = 'none';
    disconnectWalletBtn.style.display = 'block';
    walletInfo.style.display = 'block';
    
    refreshWalletBalance();
    fetchTokenHoldings();
    fetchTransactionHistory();
}

// Disconnect wallet
async function disconnectWallet() {
    try {
        await window.solana.disconnect();
        wallet = null;
        
        walletAddress.textContent = '';
        walletBalance.textContent = '0';
        connectWalletBtn.style.display = 'block';
        disconnectWalletBtn.style.display = 'none';
        walletInfo.style.display = 'none';
        
        resetTokenList();
        resetTransactionList();
        
        showNotification('Wallet disconnected', 'success');
    } catch (error) {
        showNotification(`Error disconnecting wallet: ${error.message}`, 'error');
        console.error('Wallet disconnection error:', error);
    }
}

// Copy wallet address to clipboard
function copyWalletAddress() {
    const address = wallet.publicKey.toString();
    navigator.clipboard.writeText(address).then(() => {
        showNotification('Address copied to clipboard', 'success');
    }).catch(err => {
        showNotification('Failed to copy address', 'error');
        console.error('Copy error:', err);
    });
}

// Refresh wallet balance
async function refreshWalletBalance() {
    if (!wallet) return;
    
    try {
        const publicKey = wallet.publicKey;
        const balance = await connection.getBalance(publicKey);
        const solBalance = balance / solanaWeb3.LAMPORTS_PER_SOL;
        
        walletBalance.textContent = solBalance.toFixed(4);
    } catch (error) {
        console.error('Balance refresh error:', error);
        showNotification('Failed to refresh balance', 'error');
    }
}

// Create a new token
async function createToken() {
    if (!wallet) {
        showNotification('Please connect your wallet first', 'warning');
        return;
    }
    
    const tokenName = document.getElementById('tokenName').value.trim();
    const tokenSymbol = document.getElementById('tokenSymbol').value.trim();
    const tokenDecimals = parseInt(document.getElementById('tokenDecimals').value);
    
    if (!tokenName || !tokenSymbol) {
        showNotification('Please enter token name and symbol', 'warning');
        return;
    }
    
    if (isNaN(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 9) {
        showNotification('Please enter valid decimals (0-9)', 'warning');
        return;
    }
    
    try {
        showLoading('Creating token...');
        
        // Create mint account
        const mintAccount = solanaWeb3.Keypair.generate();
        const publicKey = wallet.publicKey;
        
        // Calculate minimum balance for rent exemption
        const rentExempt = await connection.getMinimumBalanceForRentExemption(
            splToken.MintLayout.span
        );
        
        // Create transaction for token creation
        const createMintTransaction = new solanaWeb3.Transaction().add(
            // Create account
            solanaWeb3.SystemProgram.createAccount({
                fromPubkey: publicKey,
                newAccountPubkey: mintAccount.publicKey,
                lamports: rentExempt,
                space: splToken.MintLayout.span,
                programId: splToken.TOKEN_PROGRAM_ID
            }),
            // Initialize mint
            splToken.createInitializeMintInstruction(
                mintAccount.publicKey,
                tokenDecimals,
                publicKey,
                publicKey,
                splToken.TOKEN_PROGRAM_ID
            )
        );
        
        // Get recent blockhash
        const { blockhash } = await connection.getRecentBlockhash();
        createMintTransaction.recentBlockhash = blockhash;
        createMintTransaction.feePayer = publicKey;
        
        // Sign transaction
        const signed = await window.solana.signTransaction(createMintTransaction);
        signed.partialSign(mintAccount);
        
        // Send transaction
        const signature = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(signature);
        
        // Store token info locally
        storeTokenInfo(mintAccount.publicKey.toString(), tokenName, tokenSymbol, tokenDecimals);
        
        hideLoading();
        showNotification(`Token "${tokenName}" created successfully!`, 'success');
        clearCreateTokenForm();
        fetchTokenHoldings();
        fetchTransactionHistory();
        
        // Auto-fill the mint token address field
        document.getElementById('mintTokenAddress').value = mintAccount.publicKey.toString();
        
    } catch (error) {
        hideLoading();
        showNotification(`Error creating token: ${error.message}`, 'error');
        console.error('Token creation error:', error);
    }
}

// Mint tokens
async function mintToken() {
    if (!wallet) {
        showNotification('Please connect your wallet first', 'warning');
        return;
    }
    
    const mintAddress = document.getElementById('mintTokenAddress').value.trim();
    const amountStr = document.getElementById('mintTokenAmount').value.trim();
    const recipientAddress = document.getElementById('sendTokenRecipient').value.trim() || wallet.publicKey.toString();
    
    if (!mintAddress) {
        showNotification('Please enter token mint address', 'warning');
        return;
    }
    
    if (!amountStr || isNaN(parseFloat(amountStr)) || parseFloat(amountStr) <= 0) {
        showNotification('Please enter a valid amount to mint', 'warning');
        return;
    }
    
    try {
        showLoading('Minting token...');
        
        // Convert addresses to PublicKey objects
        const mintPublicKey = new solanaWeb3.PublicKey(mintAddress);
        const ownerPublicKey = wallet.publicKey;
        const recipientPublicKey = new solanaWeb3.PublicKey(recipientAddress);
        
        // Get token info to determine decimals
        let tokenInfo = getTokenInfo(mintAddress);
        let tokenDecimals = 9; // Default
        
        if (tokenInfo) {
            tokenDecimals = tokenInfo.decimals;
        } else {
            // Try to fetch decimals from the network if we don't have it locally
            try {
                const mintInfo = await splToken.getMint(connection, mintPublicKey);
                tokenDecimals = mintInfo.decimals;
            } catch (error) {
                console.error('Error fetching mint info:', error);
                // Proceed with default if we can't get it
            }
        }
        
        // Calculate amount with decimals
        const amount = parseFloat(amountStr) * Math.pow(10, tokenDecimals);
        
        // Check if recipient token account exists, create if not
        let recipientTokenAccount;
        try {
            recipientTokenAccount = await splToken.getAssociatedTokenAddress(
                mintPublicKey,
                recipientPublicKey,
                false
            );
            
            // Check if account exists
            await splToken.getAccount(connection, recipientTokenAccount);
        } catch (error) {
            // Create associated token account if it doesn't exist
            const createATAIx = splToken.createAssociatedTokenAccountInstruction(
                ownerPublicKey,
                recipientTokenAccount,
                recipientPublicKey,
                mintPublicKey
            );
            
            const transaction = new solanaWeb3.Transaction().add(createATAIx);
            const { blockhash } = await connection.getRecentBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = ownerPublicKey;
            
            const signed = await window.solana.signTransaction(transaction);
            const signature = await connection.sendRawTransaction(signed.serialize());
            await connection.confirmTransaction(signature);
        }
        
        // Create mint instruction
        const mintToIx = splToken.createMintToInstruction(
            mintPublicKey,
            recipientTokenAccount,
            ownerPublicKey,
            BigInt(amount),
            [],
            splToken.TOKEN_PROGRAM_ID
        );
        
        // Create and sign transaction
        const transaction = new solanaWeb3.Transaction().add(mintToIx);
        const { blockhash } = await connection.getRecentBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = ownerPublicKey;
        
        const signed = await window.solana.signTransaction(transaction);
        const signature = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(signature);
        
        hideLoading();
        showNotification(`Successfully minted ${amountStr} tokens`, 'success');
        clearMintTokenForm();
        fetchTokenHoldings();
        fetchTransactionHistory();
        
    } catch (error) {
        hideLoading();
        showNotification(`Error minting token: ${error.message}`, 'error');
        console.error('Token minting error:', error);
    }
}

// Send tokens
async function sendToken() {
    if (!wallet) {
        showNotification('Please connect your wallet first', 'warning');
        return;
    }
    
    const tokenAddress = document.getElementById('sendTokenAddress').value.trim();
    const recipientAddress = document.getElementById('recipientAddress').value.trim();
    const amountStr = document.getElementById('sendAmount').value.trim();
    
    if (!tokenAddress || !recipientAddress) {
        showNotification('Please enter token address and recipient address', 'warning');
        return;
    }
    
    if (!amountStr || isNaN(parseFloat(amountStr)) || parseFloat(amountStr) <= 0) {
        showNotification('Please enter a valid amount to send', 'warning');
        return;
    }
    
    try {
        showLoading('Sending token...');
        
        // Convert addresses to PublicKey objects
        const mintPublicKey = new solanaWeb3.PublicKey(tokenAddress);
        const senderPublicKey = wallet.publicKey;
        const recipientPublicKey = new solanaWeb3.PublicKey(recipientAddress);
        
        // Get token info to determine decimals
        let tokenInfo = getTokenInfo(tokenAddress);
        let tokenDecimals = 9; // Default
        
        if (tokenInfo) {
            tokenDecimals = tokenInfo.decimals;
        } else {
            // Try to fetch decimals from the network if we don't have it locally
            try {
                const mintInfo = await splToken.getMint(connection, mintPublicKey);
                tokenDecimals = mintInfo.decimals;
            } catch (error) {
                console.error('Error fetching mint info:', error);
                // Proceed with default if we can't get it
            }
        }
        
        // Calculate amount with decimals
        const amount = parseFloat(amountStr) * Math.pow(10, tokenDecimals);
        
        // Get sender token account
        const senderTokenAccount = await splToken.getAssociatedTokenAddress(
            mintPublicKey,
            senderPublicKey
        );
        
        // Check if recipient token account exists, create if not
        let recipientTokenAccount;
        try {
            recipientTokenAccount = await splToken.getAssociatedTokenAddress(
                mintPublicKey,
                recipientPublicKey
            );
            
            // Check if account exists
            await splToken.getAccount(connection, recipientTokenAccount);
        } catch (error) {
            // Create associated token account if it doesn't exist
            const createATAIx = splToken.createAssociatedTokenAccountInstruction(
                senderPublicKey,
                recipientTokenAccount,
                recipientPublicKey,
                mintPublicKey
            );
            
            const transaction = new solanaWeb3.Transaction().add(createATAIx);
            const { blockhash } = await connection.getRecentBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = senderPublicKey;
            
            const signed = await window.solana.signTransaction(transaction);
            const signature = await connection.sendRawTransaction(signed.serialize());
            await connection.confirmTransaction(signature);
        }
        
        // Create transfer instruction
        const transferIx = splToken.createTransferInstruction(
            senderTokenAccount,
            recipientTokenAccount,
            senderPublicKey,
            BigInt(amount),
            [],
            splToken.TOKEN_PROGRAM_ID
        );
        
        // Create and sign transaction
        const transaction = new solanaWeb3.Transaction().add(transferIx);
        const { blockhash } = await connection.getRecentBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = senderPublicKey;
        
        const signed = await window.solana.signTransaction(transaction);
        const signature = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(signature);
        
        hideLoading();
        showNotification(`Successfully sent ${amountStr} tokens`, 'success');
        clearSendTokenForm();
        fetchTokenHoldings();
        fetchTransactionHistory();
        
    } catch (error) {
        hideLoading();
        showNotification(`Error sending token: ${error.message}`, 'error');
        console.error('Token sending error:', error);
    }
}

// Fetch token holdings
async function fetchTokenHoldings() {
    if (!wallet) return;
    
    try {
        resetTokenList();
        
        // Get all token accounts for the connected wallet
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            wallet.publicKey,
            { programId: splToken.TOKEN_PROGRAM_ID }
        );
        
        if (tokenAccounts.value.length === 0) {
            tokenList.innerHTML = '<p class="empty-state">No tokens found in your wallet</p>';
            return;
        }
        
        // Process each token account
        for (const tokenAccount of tokenAccounts.value) {
            const tokenData = tokenAccount.account.data.parsed.info;
            const mintAddress = tokenData.mint;
            const balance = tokenData.tokenAmount.uiAmount;
            
            if (balance === 0) continue; // Skip empty tokens
            
            // Try to get token info from localStorage
            let tokenInfo = getTokenInfo(mintAddress);
            let tokenName = 'Unknown Token';
            let tokenSymbol = 'UNKNOWN';
            
            if (tokenInfo) {
                tokenName = tokenInfo.name;
                tokenSymbol = tokenInfo.symbol;
            }
            
            // Create token item element
            const tokenItem = document.createElement('div');
            tokenItem.className = 'token-item';
            tokenItem.innerHTML = `
                <div class="token-symbol">${tokenSymbol}</div>
                <div class="token-name">${tokenName}</div>
                <div class="token-balance">${balance.toLocaleString()}</div>
                <div class="token-address">${shortenAddress(mintAddress)}</div>
            `;
            
            tokenList.appendChild(tokenItem);
        }
    } catch (error) {
        console.error('Error fetching token holdings:', error);
        tokenList.innerHTML = '<p class="empty-state">Error loading tokens</p>';
    }
}

// Fetch transaction history
async function fetchTransactionHistory() {
    if (!wallet) return;
    
    try {
        resetTransactionList();
        showLoading('Loading transactions...');
        
        // Get recent transactions for the connected wallet
        const transactions = await connection.getSignaturesForAddress(wallet.publicKey, { limit: 10 });
        
        if (transactions.length === 0) {
            transactionList.innerHTML = '<p class="empty-state">No transactions found</p>';
            hideLoading();
            return;
        }
        
        // Process each transaction
        for (const tx of transactions) {
            const signature = tx.signature;
            const timestamp = new Date(tx.blockTime * 1000).toLocaleString();
            const confirmed = tx.confirmationStatus === 'finalized';
            
            // Create transaction item element
            const txItem = document.createElement('div');
            txItem.className = 'transaction-item';
            txItem.innerHTML = `
                <div class="transaction-details">
                    <div class="transaction-type">Transaction</div>
                    <div class="transaction-signature">${shortenAddress(signature)}</div>
                    <div class="transaction-time">${timestamp}</div>
                </div>
                <div class="transaction-status ${confirmed ? 'status-confirmed' : 'status-pending'}">
                    ${confirmed ? 'Confirmed' : 'Pending'}
                </div>
                <a href="https://explorer.solana.com/tx/${signature}?cluster=devnet" 
                   class="view-transaction" target="_blank">View</a>
            `;
            
            transactionList.appendChild(txItem);
        }
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error fetching transaction history:', error);
        transactionList.innerHTML = '<p class="empty-state">Error loading transactions</p>';
    }
}

// Store token info in localStorage
function storeTokenInfo(mintAddress, name, symbol, decimals) {
    try {
        // Get existing tokens or create empty array
        const tokens = JSON.parse(localStorage.getItem('solanaTokens') || '[]');
        
        // Add new token info
        tokens.push({
            mintAddress,
            name,
            symbol,
            decimals
        });
        
        // Save back to localStorage
        localStorage.setItem('solanaTokens', JSON.stringify(tokens));
    } catch (error) {
        console.error('Error storing token info:', error);
    }
}

// Get token info from localStorage
function getTokenInfo(mintAddress) {
    try {
        const tokens = JSON.parse(localStorage.getItem('solanaTokens') || '[]');
        return tokens.find(token => token.mintAddress === mintAddress);
    } catch (error) {
        console.error('Error retrieving token info:', error);
        return null;
    }
}

// Helper functions
function resetTokenList() {
    tokenList.innerHTML = '';
}

function resetTransactionList() {
    transactionList.innerHTML = '';
}

function clearCreateTokenForm() {
    document.getElementById('tokenName').value = '';
    document.getElementById('tokenSymbol').value = '';
    document.getElementById('tokenDecimals').value = '9';
}

function clearMintTokenForm() {
    document.getElementById('mintTokenAmount').value = '';
    document.getElementById('sendTokenRecipient').value = '';
}

function clearSendTokenForm() {
    document.getElementById('sendAmount').value = '';
    document.getElementById('recipientAddress').value = '';
}

function shortenAddress(address) {
    return address.slice(0, 6) + '...' + address.slice(-4);
}

// Notification functions
function showNotification(message, type = 'info') {
    notificationText.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'flex';
    
    // Auto-hide after 5 seconds
    setTimeout(hideNotification, 5000);
}

function hideNotification() {
    notification.style.display = 'none';
}

// Loading indicator functions
function showLoading(message = 'Processing...') {
    loadingText.textContent = message;
    loadingIndicator.style.display = 'flex';
}

function hideLoading() {
    loadingIndicator.style.display = 'none';
}