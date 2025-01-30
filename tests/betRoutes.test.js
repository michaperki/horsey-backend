
// backend/tests/betRoutes.test.js

jest.mock('../services/lichessService'); // Mock lichessService

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
        // Create users
        seekerUser = await User.create({
            username: 'seeker',
            email: 'seeker@example.com',
            password: await bcrypt.hash('seekerpass', 10),
            tokenBalance: 500,
        });

        creator = await User.create({
            username: 'creator',
            email: 'creator@example.com',
            password: await bcrypt.hash('creatorpass', 10),
            tokenBalance: 1000,
            lichessUsername: 'creatorLichessUser',
            lichessAccessToken: 'creatorAccessToken',
        });

        opponent = await User.create({
            username: 'opponent',
            email: 'opponent@example.com',
            password: await bcrypt.hash('opponentpass', 10),
            tokenBalance: 500,
            lichessUsername: 'opponentLichessUser',
            lichessAccessToken: 'opponentAccessToken',
        });

        // Generate JWT tokens
        creatorToken = jwt.sign({ id: creator._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        opponentToken = jwt.sign({ id: opponent._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        seekerToken = jwt.sign({ id: seekerUser._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        // Create a pending bet
        bet = await Bet.create({
            creatorId: creator._id,
            creatorColor: 'white',
            amount: 100,
            status: 'pending',
            timeControl: '5|3',
            currencyType: 'token',
        });

        // Mock services
        getGameOutcome.mockResolvedValue({ success: true, status: 'created' });
        createLichessGame.mockResolvedValue({
            success: true,
            gameId: 'lichessGameId123',
            gameLink: 'https://lichess.org/lichessGameId123',
        });
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
        jest.resetAllMocks();
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
                    currencyType: 'token', // Required field
                    variant: 'standard', // Added field
                });

            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('message', 'Bet placed successfully');
            expect(res.body.bet).toHaveProperty('creatorId', creator._id.toString());
            expect(res.body.bet).toHaveProperty('status', 'pending');

            const updatedCreator = await User.findById(creator._id);
            expect(updatedCreator.tokenBalance).toBe(850); // 1000 - 150
        });

        it('should return error for insufficient balance', async () => {
            const res = await request(app)
                .post('/bets/place')
                .set('Authorization', `Bearer ${creatorToken}`)
                .send({
                    colorPreference: 'black',
                    amount: 2000, // Exceeds balance
                    timeControl: '5|3',
                    currencyType: 'token', // Required field
                    variant: 'standard', // Added field
                });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error', 'Insufficient token balance');
        });

        it('should handle invalid colorPreference', async () => {
            const res = await request(app)
                .post('/bets/place')
                .set('Authorization', `Bearer ${creatorToken}`)
                .send({
                    colorPreference: 'blue', // Invalid
                    amount: 100,
                    timeControl: '5|3',
                    currencyType: 'token', // Required field
                    variant: 'standard', // Added field
                });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error', 'colorPreference must be "white", "black", or "random"');
        });
    });

    describe('POST /bets/accept/:betId', () => {
        it('should return error if opponent balance is insufficient', async () => {
            opponent.tokenBalance = 50; // Insufficient balance
            await opponent.save();

            const res = await request(app)
                .post(`/bets/accept/${bet._id}`)
                .set('Authorization', `Bearer ${opponentToken}`);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error', 'Insufficient token balance to accept this bet');
        });
    });
});
