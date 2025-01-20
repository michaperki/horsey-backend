
// backend/tests/betRoutes.test.js

jest.mock('../services/lichessService'); // Mock lichessService
jest.mock('../services/emailService'); // Mock emailService

const { getGameOutcome, createLichessGame, getUsernameFromAccessToken } = require('../services/lichessService');
const request = require('supertest');
const app = require('../server'); // Ensure your Express app is exported from server.js
const User = require('../models/User');
const Bet = require('../models/Bet');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

describe('Bet Routes', () => {
    let creatorToken, opponentToken, seekerToken;
    let creator, opponent, seekerUser, bet;
    let mockIo;

    beforeEach(async () => {
        // Create users with lichessUsername and access tokens
        seekerUser = await User.create({
            username: 'seeker',
            email: 'seeker@example.com',
            password: await bcrypt.hash('seekerpass', 10),
            balance: 500,
            // Seeker does not need a Lichess account for placing bets
        });

        creator = await User.create({
            username: 'creator',
            email: 'creator@example.com',
            password: await bcrypt.hash('creatorpass', 10),
            balance: 1000,
            lichessUsername: 'creatorLichessUser', // Lichess username
            lichessAccessToken: 'creatorAccessToken', // Lichess access token
        });

        opponent = await User.create({
            username: 'opponent',
            email: 'opponent@example.com',
            password: await bcrypt.hash('opponentpass', 10),
            balance: 500,
            lichessUsername: 'opponentLichessUser', // Lichess username
            lichessAccessToken: 'opponentAccessToken', // Lichess access token
        });

        // Generate JWT tokens
        creatorToken = jwt.sign({ id: creator._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        opponentToken = jwt.sign({ id: opponent._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        seekerToken = jwt.sign({ id: seekerUser._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        // Create a pending bet without gameId
        bet = await Bet.create({
            creatorId: creator._id,
            creatorColor: 'white',
            amount: 100,
            status: 'pending',
            timeControl: '5|3',
        });

        // Mock getGameOutcome to return a successful status
        getGameOutcome.mockResolvedValue({ success: true, status: 'created' });

        // Mock createLichessGame to return gameId and gameLink
        createLichessGame.mockImplementation(async (timeControl, player1AccessToken, player2AccessToken, getUsernameFn) => {
            const player1Username = await getUsernameFn(player1AccessToken);
            const player2Username = await getUsernameFn(player2AccessToken);

            return {
                success: true,
                gameId: 'lichessGameId123',
                gameLink: 'https://lichess.org/lichessGameId123',
            };
        });

        // Mock getUsernameFromAccessToken to return appropriate usernames
        getUsernameFromAccessToken.mockImplementation(async (token) => {
            if (token === 'creatorAccessToken') return 'creatorUsername';
            if (token === 'opponentAccessToken') return 'opponentUsername';
            return null;
        });

        // Mock io
        mockIo = {
            to: jest.fn().mockReturnThis(),
            emit: jest.fn(),
        };
        app.set('io', mockIo);
    });

    afterEach(async () => {
        await User.deleteMany({});
        await Bet.deleteMany({});
        jest.resetAllMocks(); // Reset all mocks after each test
    });

    describe('GET /bets/seekers', () => {
        it('should retrieve available seekers successfully', async () => {
            // Create additional pending bets to act as seekers
            const seekerBet = await Bet.create({
                creatorId: seekerUser._id,
                creatorColor: 'random',
                amount: 50,
                status: 'pending',
                timeControl: '3|2',
            });

            const res = await request(app)
                .get('/bets/seekers')
                .set('Authorization', `Bearer ${creatorToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toBeInstanceOf(Array);
            expect(res.body.length).toBeGreaterThan(0);

            const seeker = res.body.find(s => s.id === seekerBet._id.toString());
            expect(seeker).toBeDefined();
            expect(seeker).toHaveProperty('creator', 'seeker');
            expect(seeker).toHaveProperty('creatorBalance', 500);
            expect(seeker).toHaveProperty('wager', 50);
            expect(seeker).toHaveProperty('gameType', 'Standard');
            expect(seeker).toHaveProperty('colorPreference', 'random');
        });

        it('should handle server errors gracefully', async () => {
            // Mock Bet.find to throw an error
            const mockFind = jest.spyOn(Bet, 'find').mockImplementationOnce(() => {
                throw new Error('Database error');
            });

            const res = await request(app)
                .get('/bets/seekers')
                .set('Authorization', `Bearer ${creatorToken}`);

            expect(res.statusCode).toEqual(500);
            expect(res.body).toHaveProperty('error', 'An unexpected error occurred while fetching seekers.');

            mockFind.mockRestore(); // Restore the original implementation
        });
    });

    describe('POST /bets/place', () => {
        it('should successfully place a bet without gameId', async () => {
            const res = await request(app)
                .post('/bets/place')
                .set('Authorization', `Bearer ${creatorToken}`)
                .send({
                    colorPreference: 'black',
                    amount: 150,
                    timeControl: '3|2',
                });

            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('message', 'Bet placed successfully');
            expect(res.body.bet).toHaveProperty('creatorId', creator._id.toString());
            expect(res.body.bet).toHaveProperty('status', 'pending');
            expect(res.body.bet).toHaveProperty('gameId', null);
            expect(res.body.bet).toHaveProperty('timeControl', '3|2');
            expect(res.body.bet).toHaveProperty('gameLink', null); // Since gameLink is not set yet

            const updatedUser = await User.findById(creator._id);
            expect(updatedUser.balance).toBe(850); // 1000 - 150

            // Verify that io.to().emit() was called
            expect(mockIo.to).toHaveBeenCalledWith(creator._id.toString());
            expect(mockIo.emit).toHaveBeenCalledWith('betCreated', expect.any(Object));
        });

        it('should return error for insufficient balance', async () => {
            const res = await request(app)
                .post('/bets/place')
                .set('Authorization', `Bearer ${creatorToken}`)
                .send({
                    colorPreference: 'black',
                    amount: 2000, // More than balance
                    timeControl: '5|3',
                });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error', 'Insufficient token balance');
        });

        it('should handle invalid colorPreference', async () => {
            const res = await request(app)
                .post('/bets/place')
                .set('Authorization', `Bearer ${creatorToken}`)
                .send({
                    colorPreference: 'blue', // Invalid color
                    amount: 100,
                    timeControl: '5|3',
                });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error', 'colorPreference must be "white", "black", or "random"');
        });

        it('should handle server errors gracefully', async () => {
            // Mock Bet.prototype.save to throw an error
            const mockSave = jest.spyOn(Bet.prototype, 'save').mockImplementationOnce(() => {
                throw new Error('Database error');
            });

            // Make the request to place a bet
            const res = await request(app)
                .post('/bets/place')
                .set('Authorization', `Bearer ${creatorToken}`)
                .send({
                    colorPreference: 'white',
                    amount: 100,
                    timeControl: '5|3',
                });

            // Assertions
            expect(res.statusCode).toEqual(500);
            expect(res.body).toHaveProperty('error', 'Server error while placing bet');

            // Verify the mock was called
            expect(mockSave).toHaveBeenCalled();

            // Cleanup
            mockSave.mockRestore();
        });
    });

    describe('POST /bets/accept/:betId', () => {
        it('should accept a bet successfully and assign colors correctly', async () => {
            const res = await request(app)
                .post(`/bets/accept/${bet._id}`)
                .set('Authorization', `Bearer ${opponentToken}`)
                .send({
                    colorPreference: 'black',
                });

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('message', 'Bet matched successfully');
            expect(res.body.bet).toHaveProperty('finalWhiteId');
            expect(res.body.bet).toHaveProperty('finalBlackId');
            expect(res.body.bet).toHaveProperty('gameId', 'lichessGameId123');
            expect(res.body.bet).toHaveProperty('status', 'matched');
            expect(res.body.bet).toHaveProperty('gameLink', 'https://lichess.org/lichessGameId123');

            // Verify that colors are assigned correctly
            const { finalWhiteId, finalBlackId } = res.body.bet;
            expect([finalWhiteId, finalBlackId]).toContain(creator._id.toString());
            expect([finalWhiteId, finalBlackId]).toContain(opponent._id.toString());

            // Verify that the opponent's balance was deducted
            const updatedOpponent = await User.findById(opponent._id);
            expect(updatedOpponent.balance).toBe(400); // 500 - 100

            // Verify that io.to().emit() was called for both users
            expect(mockIo.to).toHaveBeenCalledWith(creator._id.toString());
            expect(mockIo.emit).toHaveBeenCalledWith('betAccepted', expect.any(Object));

            expect(mockIo.to).toHaveBeenCalledWith(opponent._id.toString());
            expect(mockIo.emit).toHaveBeenCalledWith('betAccepted', expect.any(Object));
        });

        it('should handle color conflict by random assignment', async () => {
            // Force creator's color preference to 'white'
            bet.creatorColor = 'white';
            await bet.save();

            // Mock getUsernameFromAccessToken to return appropriate usernames
            getUsernameFromAccessToken.mockImplementation(async (token) => {
                if (token === 'creatorAccessToken') return 'creatorUsername';
                if (token === 'opponentAccessToken') return 'opponentUsername';
                return null;
            });

            const res = await request(app)
                .post(`/bets/accept/${bet._id}`)
                .set('Authorization', `Bearer ${opponentToken}`)
                .send({
                    colorPreference: 'white', // Both users choosing 'white'
                });

            expect(res.statusCode).toEqual(200);
            const { finalWhiteId, finalBlackId } = res.body.bet;

            // Both users should be assigned different colors randomly
            expect(finalWhiteId).not.toBe(finalBlackId);
            expect([finalWhiteId, finalBlackId]).toContain(creator._id.toString());
            expect([finalWhiteId, finalBlackId]).toContain(opponent._id.toString());

            // Verify that the opponent's balance was deducted
            const updatedOpponent = await User.findById(opponent._id);
            expect(updatedOpponent.balance).toBe(400); // 500 - 100

            // Verify that io.to().emit() was called for both users
            expect(mockIo.to).toHaveBeenCalledWith(creator._id.toString());
            expect(mockIo.emit).toHaveBeenCalledWith('betAccepted', expect.any(Object));

            expect(mockIo.to).toHaveBeenCalledWith(opponent._id.toString());
            expect(mockIo.emit).toHaveBeenCalledWith('betAccepted', expect.any(Object));
        });

        it('should return error if opponent balance is insufficient', async () => {
            // Set opponent's balance to be insufficient
            opponent.balance = 50; // Insufficient balance
            await opponent.save();

            const res = await request(app)
                .post(`/bets/accept/${bet._id}`)
                .set('Authorization', `Bearer ${opponentToken}`)
                .send({
                    colorPreference: 'black',
                });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error', 'Insufficient balance to accept this bet');
        });

        it('should prevent a user from accepting their own bet', async () => {
            const res = await request(app)
                .post(`/bets/accept/${bet._id}`)
                .set('Authorization', `Bearer ${creatorToken}`) // Creator trying to accept their own bet
                .send({
                    colorPreference: 'white',
                });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error', 'You cannot accept your own bet.');

            // Verify bet remains pending
            const updatedBet = await Bet.findById(bet._id);
            expect(updatedBet.status).toBe('pending');
            expect(updatedBet.opponentId).toBeNull();

            // Verify creator's balance is unchanged
            const updatedCreator = await User.findById(creator._id);
            expect(updatedCreator.balance).toBe(1000);
        });

        it('should handle server errors gracefully when fetching the bet', async () => {
            // Mock Bet.findOneAndUpdate to throw an error
            const mockFindOneAndUpdate = jest.spyOn(Bet, 'findOneAndUpdate').mockImplementationOnce(() => {
                throw new Error('Database error');
            });

            // Make the request
            const res = await request(app)
                .post(`/bets/accept/${bet._id}`)
                .set('Authorization', `Bearer ${opponentToken}`)
                .send({
                    colorPreference: 'black',
                });

            // Assertions
            expect(res.statusCode).toEqual(500);
            expect(res.body).toHaveProperty('error', 'An unexpected error occurred while accepting the bet.');

            // Verify the mock was called
            expect(mockFindOneAndUpdate).toHaveBeenCalled();

            // Cleanup
            mockFindOneAndUpdate.mockRestore();
        });

        it('should handle server errors gracefully when creating the Lichess game', async () => {
            // Mock createLichessGame to fail
            createLichessGame.mockResolvedValueOnce({ success: false, error: 'Lichess API error' });

            // Make the request
            const res = await request(app)
                .post(`/bets/accept/${bet._id}`)
                .set('Authorization', `Bearer ${opponentToken}`)
                .send({
                    colorPreference: 'black',
                });

            // Assertions
            expect(res.statusCode).toEqual(500);
            expect(res.body).toHaveProperty('error', 'Failed to create Lichess game');
            expect(res.body).toHaveProperty('details', 'Lichess API error'); // Ensure details are present

            // Verify that the opponent's balance was reverted
            const updatedOpponent = await User.findById(opponent._id);
            expect(updatedOpponent.balance).toBe(500); // Original balance, since deduction was reverted
        });
    });
});

