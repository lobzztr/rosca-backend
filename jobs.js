const cron = require('node-cron');
const { getSheetData } = require('./sheets');
const { User, ROSCA, UserROSCAStatus } = require('./models');
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

// Job to fetch and update data from Google Sheets
const updateSheetData = async () => {
  try {
    console.log('Fetching data from Google Sheets...');
    const { users, roscas } = await getSheetData(process.env.SPREADSHEET_ID);
    
    // Update User data
    for (const userData of users) {
      await User.findOneAndUpdate(
        { walletAddress: userData.walletAddress },
        userData,
        { upsert: true, new: true }
      );
    }

    // Update ROSCA data
    for (const roscaData of roscas) {
      const slots = await getSlots(roscaData.contractAddress);
      const currentRound = await getcurrentRound(roscaData.contractAddress);
      const participants = await getParticipants(roscaData.contractAddress);

      await ROSCA.findOneAndUpdate(
        { contractAddress: roscaData.contractAddress },
        { 
          ...roscaData, 
          slots: slots !== null ? slots : undefined, 
          currentRound, 
          participants: participants || [] 
        },
        { upsert: true, new: true }
      );
    }

    console.log('Sheet data updated successfully');
  } catch (error) {
    console.error('Error updating sheet data:', error);
  }
};

// Job to update ROSCA payment status for all users
const updateROSCAPaymentStatus = async () => {
  try {
    console.log('Updating ROSCA payment status for all users...');
    const users = await User.find({});
    const roscas = await ROSCA.find({});

    for (const user of users) {
      for (const rosca of roscas) {
        if (rosca.participants.includes(user.walletAddress)) {
          const statuses = await Promise.all(Array.from({ length: rosca.slots }, (_, i) => i + 1).map(async (round) => {
            const [hasPaid, hasBid] = await Promise.all([
              getHasPaidRound(rosca.contractAddress, user.walletAddress, round),
              getHasBidRound(rosca.contractAddress, user.walletAddress, round)
            ]);
            return { round, hasPaid, hasBid };
          }));

          const [participantWonRound, hasWon, userContributions] = await Promise.all([
            getParticipantWonRound(rosca.contractAddress, user.walletAddress),
            getHasWon(rosca.contractAddress, user.walletAddress),
            getUserContributions(rosca.contractAddress, user.walletAddress)
          ]);

          await UserROSCAStatus.findOneAndUpdate(
            { userAddress: user.walletAddress, contractAddress: rosca.contractAddress },
            { 
              userAddress: user.walletAddress,
              contractAddress: rosca.contractAddress,
              statuses,
              participantWonRound,
              hasWon,
              userContributions,
              lastUpdated: new Date()
            },
            { upsert: true, new: true }
          );
        }
      }
    }

    console.log('ROSCA payment status updated successfully');
  } catch (error) {
    console.error('Error updating ROSCA payment status:', error);
  }
};

// Schedule jobs
const scheduleJobs = () => {
  // Run updateSheetData job every 15 minutes
  cron.schedule('*/5 * * * *', updateSheetData);

  // Run updateROSCAPaymentStatus job every 30 minutes
  cron.schedule('*/10 * * * *', updateROSCAPaymentStatus);
};

module.exports = { scheduleJobs };