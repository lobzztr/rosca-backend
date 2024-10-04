const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Read the ABI from the JSON file
const abiPath = path.join(__dirname, 'contractABI.json');
const contractABI = JSON.parse(fs.readFileSync(abiPath, 'utf8'));

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callContractMethodWithRetry(contractAddress, methodName, params = [], maxRetries = 5) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      console.log(`Attempting to call ${methodName} for contract ${contractAddress} (Attempt ${retries + 1}/${maxRetries})`);
      const contract = new ethers.Contract(contractAddress, contractABI, provider);
      const result = await contract[methodName](...params);
      console.log(`Successfully called ${methodName}`);
      return result;
    } catch (error) {
      console.error(`Attempt ${retries + 1} failed for method ${methodName}:`, error.message);
      console.error('Full error:', JSON.stringify(error, null, 2));
      
      if (error.info && error.info.error && error.info.error.code === -32016) {
        console.log('Rate limit exceeded. Waiting before retry...');
        await sleep(Math.pow(2, retries) * 1000); // Exponential backoff
        retries++;
      } else if (error.code === 'CALL_EXCEPTION' && error.reason === null) {
        console.log('Contract call failed. This might be due to an issue with the contract or the call parameters.');
        throw new Error(`Contract call failed for method ${methodName}`);
      } else {
        throw error; // If it's not a rate limit error or a contract call exception, throw it immediately
      }
    }
    
    // Add a small delay between calls to avoid rate limiting
    await sleep(1000);
  }
  throw new Error(`Max retries (${maxRetries}) exceeded for method ${methodName}`);
}

async function getSlots(contractAddress) {
  const slots = await callContractMethodWithRetry(contractAddress, 'slots');
  return slots !== null ? Number(slots) : null;
}

async function getcurrentRound(contractAddress) {
  const currentRound = await callContractMethodWithRetry(contractAddress, 'currentRound');
  return currentRound !== null ? Number(currentRound) : null;
}


async function getParticipants(contractAddress) {
  return await callContractMethodWithRetry(contractAddress, 'getParticipants');
}

async function getHasPaidRound(contractAddress, userAddress, round) {
  const result = await callContractMethodWithRetry(contractAddress, 'hasPaidRound', [userAddress, round]);
  if (typeof result !== 'boolean') {
    throw new Error(`Invalid result for hasPaidRound: ${result}`);
  }
  return result;
}

async function getHasBidRound(contractAddress, userAddress, round) {
  const result = await callContractMethodWithRetry(contractAddress, 'hasBidRound', [userAddress, round]);
  if (typeof result !== 'boolean') {
    throw new Error(`Invalid result for hasBidRound: ${result}`);
  }
  return result;
}

async function getParticipantWonRound(contractAddress, userAddress) {
  const result = await callContractMethodWithRetry(contractAddress, 'participantWonRound', [userAddress]);
  if (typeof result === 'object' && result._isBigNumber) {
    return result.toNumber();
  } else if (typeof result === 'bigint') {
    return Number(result);
  } else if (typeof result === 'string' || typeof result === 'number') {
    return Number(result);
  } else {
    throw new Error(`Unexpected result type for participantWonRound: ${typeof result}`);
  }
}

async function getHasWon(contractAddress, userAddress) {
  const result = await callContractMethodWithRetry(contractAddress, 'hasWon', [userAddress]);
  if (typeof result !== 'boolean') {
    throw new Error(`Invalid result for hasWon: ${result}`);
  }
  return result;
}

async function getUserContributions(contractAddress, userAddress) {
  const result = await callContractMethodWithRetry(contractAddress, 'userContributions', [userAddress]);
  if (typeof result === 'object' && result._isBigNumber) {
    return result.toNumber();
  } else if (typeof result === 'bigint') {
    return Number(result);
  } else if (typeof result === 'string' || typeof result === 'number') {
    return Number(result);
  } else {
    throw new Error(`Unexpected result type for userContributions: ${typeof result}`);
  }
}


module.exports = { 
  getSlots,
  getcurrentRound,
  getParticipants, 
  getHasPaidRound, 
  getHasBidRound, 
  getParticipantWonRound, 
  getHasWon, 
  getUserContributions 
};