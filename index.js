const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const { scheduleJobs } = require('./jobs');
const { getSheetData } = require('./sheets');
const { 
  getSlots,
  getcurrentRound, 
  getParticipants, 
  getHasPaidRound, 
  getHasBidRound, 
  getParticipantWonRound, 
  getHasWon, 
  getUserContributions 
} = require('./contractInteraction');
const { User, ROSCA, UserROSCAStatus } = require('./models');
const MVP = require('./mvpSchema');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Utility function for exponential backoff
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const exponentialBackoff = async (retryCount) => {
  const delay = Math.pow(2, retryCount) * 1000;
  await sleep(delay);
};

// Retry function for database operations
async function retryOperation(operation, maxRetries = 3) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      if (error.name === 'MongooseError' && error.message.includes('buffering timed out')) {
        console.log(`Retry attempt ${retries + 1} for database operation`);
        await exponentialBackoff(retries);
        retries++;
      } else {
        throw error;
      }
    }
  }
  throw new Error(`Operation failed after ${maxRetries} retries`);
}

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 30000, // Increase timeout to 30 seconds
  socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
})
.then(() => {
  console.log('Connected to MongoDB');
  // Schedule jobs after successful database connection
  scheduleJobs();
})
.catch((err) => console.error('MongoDB connection error:', err));

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the ROSCA backend!' });
});

// Google Sheets data route
app.get('/api/sheetData', async (req, res) => {
  try {
    const data = await getSheetData(process.env.SPREADSHEET_ID);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/sheetData:', error);
    res.status(500).json({ error: 'Failed to fetch sheet data', details: error.message });
  }
});

// ROSCA data route
app.get('/api/roscaData', async (req, res) => {
  try {
    const { roscas } = await getSheetData(process.env.SPREADSHEET_ID);
    
    const roscaData = await Promise.all(roscas.map(async (rosca) => {
      try {
        const slots = await getSlots(rosca.contractAddress);
        const currentRound = await getcurrentRound(rosca.contractAddress);
        const participants = await getParticipants(rosca.contractAddress);
        
        // Wrap the database operation in the retry function
        const updatedRosca = await retryOperation(() => 
          ROSCA.findOneAndUpdate(
            { contractAddress: rosca.contractAddress },
            { ...rosca, slots: slots !== null ? slots : undefined, currentRound, participants: participants || [] },
            { new: true, upsert: true }
          )
        );
        
        return updatedRosca;
      } catch (error) {
        console.error(`Error processing ROSCA ${rosca.contractAddress}:`, error);
        return { ...rosca, error: error.message };
      }
    }));

    res.json(roscaData);
  } catch (error) {
    console.error('Error in /api/roscaData:', error);
    res.status(500).json({ error: 'Failed to fetch ROSCA data', details: error.message });
  }
});

// User data route
app.get('/api/userData', async (req, res) => {
  try {
    const { users } = await getSheetData(process.env.SPREADSHEET_ID);
    
    const userData = await Promise.all(users.map(async (user) => {
      try {
        // Wrap the database operation in the retry function
        const updatedUser = await retryOperation(() => 
          User.findOneAndUpdate(
            { walletAddress: user.walletAddress },
            user,
            { new: true, upsert: true }
          )
        );
        
        return updatedUser;
      } catch (error) {
        console.error(`Error processing user ${user.walletAddress}:`, error);
        return { ...user, error: error.message };
      }
    }));

    res.json(userData);
  } catch (error) {
    console.error('Error in /api/userData:', error);
    res.status(500).json({ error: 'Failed to fetch user data', details: error.message });
  }
});

// Modified endpoint to get comprehensive ROSCA status for a single user
app.get('/api/roscaPaymentStatus/:contractAddress/:userAddress', async (req, res) => {
  try {
    const { contractAddress, userAddress } = req.params;
    
    // Get ROSCA data from MongoDB
    const rosca = await retryOperation(() => ROSCA.findOne({ contractAddress }));
    
    if (!rosca) {
      return res.status(404).json({ error: 'ROSCA not found', details: 'No ROSCA found with the given contract address' });
    }

    if (!rosca.slots) {
      return res.status(404).json({ error: 'Invalid ROSCA data', details: 'The ROSCA has no slots information' });
    }

    // Get payment and bid status for the user across all rounds
    const statuses = await Promise.all(Array.from({ length: rosca.slots }, (_, i) => i + 1).map(async (round) => {
      try {
        const [hasPaid, hasBid] = await Promise.all([
          getHasPaidRound(contractAddress, userAddress, round),
          getHasBidRound(contractAddress, userAddress, round)
        ]);
        return { round, hasPaid, hasBid };
      } catch (error) {
        console.error(`Error getting status for user ${userAddress} in round ${round}:`, error);
        // Return the round number but mark the status as unknown
        return { round, hasPaid: 'unknown', hasBid: 'unknown', error: error.message };
      }
    }));
    
    // Filter out any rounds with unknown status
    const validStatuses = statuses.filter(status => status.hasPaid !== 'unknown' && status.hasBid !== 'unknown');
    
    if (validStatuses.length === 0) {
      return res.status(500).json({ error: 'Failed to fetch valid status data for any round' });
    }

    // Get additional user data
    let participantWonRound, hasWon, userContributions;
    try {
      [participantWonRound, hasWon, userContributions] = await Promise.all([
        getParticipantWonRound(contractAddress, userAddress),
        getHasWon(contractAddress, userAddress),
        getUserContributions(contractAddress, userAddress)
      ]);
    } catch (error) {
      console.error('Error getting additional user data:', error);
      participantWonRound = 0;
      hasWon = false;
      userContributions = 0;
    }

    // Update or create UserROSCAStatus document in MongoDB
    const updatedStatus = await retryOperation(() => 
      UserROSCAStatus.findOneAndUpdate(
        { userAddress, contractAddress },
        { 
          userAddress,
          contractAddress,
          statuses: validStatuses,
          participantWonRound,
          hasWon,
          userContributions,
          lastUpdated: new Date()
        },
        { new: true, upsert: true }
      )
    );
    
    res.json(updatedStatus);
  } catch (error) {
    console.error('Error in /api/roscaPaymentStatus:', error);
    res.status(500).json({ error: 'Failed to fetch ROSCA status', details: error.message });
  }
});

// New MVP data route
app.get('/api/mvp/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;

    // Find the user
    const user = await retryOperation(() => 
      User.findOne({ walletAddress: { $regex: new RegExp(`^${walletAddress}$`, 'i') } })
    );

    if (!user) {
      return res.status(404).json({ 
        error: 'User not found', 
        message: 'The provided wallet address is not associated with any known user.'
      });
    }

    // Find all ROSCAs the user participates in
    const roscas = await retryOperation(() => 
      ROSCA.find({ participants: { $regex: new RegExp(`^${walletAddress}$`, 'i') } })
    );

    const kuris = await Promise.all(roscas.map(async (rosca) => {
      const participants = await Promise.all(rosca.participants.map(async (participantAddress) => {
        const participantUser = await retryOperation(() => 
          User.findOne({ walletAddress: { $regex: new RegExp(`^${participantAddress}$`, 'i') } })
        );
        const userStatus = await retryOperation(() => 
          UserROSCAStatus.findOne({
            userAddress: { $regex: new RegExp(`^${participantAddress}$`, 'i') },
            contractAddress: rosca.contractAddress
          })
        );

        const statuses = Array(rosca.slots).fill().map((_, index) => {
          const round = index + 1;
          if (rosca.currentRound < round) return 'PENDING';
          
          const roundStatus = userStatus?.statuses.find(s => s.round === round);
          
          if (userStatus?.participantWonRound === round) return 'WON';
          if (roundStatus?.hasBid) return 'BID';
          if (roundStatus?.hasPaid) return 'PAID';
          return 'UNPAID';
        });

        return {
          name: participantUser?.name || 'Unknown',
          statuses
        };
      }));

      return {
        id: rosca.id,
        contributions: 0,  // Hardcoded as per previous instruction
        prize: 0,  // Hardcoded as per previous instruction
        truthTable: {
          periods: rosca.slots,
          participants
        }
      };
    }));

    const mvpData = {
      walletAddress: user.walletAddress,
      user: {
        id: user.id,
        name: user.name,
        balance: user.balance,
        points: user.points
      },
      kuris
    };

    res.json(mvpData);
  } catch (error) {
    console.error('Error in /api/mvp:', error);
    res.status(500).json({ error: 'Failed to fetch MVP data', details: error.message });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});
