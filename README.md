# Summary README

This backend project provides chess-betting functionality via Lichess integration, token operations on Ethereum, and user management with a MongoDB database.

## Key Features
- **User & Admin Authentication** (JWT-based)
- **Bet Management** (place, accept, view history)
- **Lichess Integration** (game creation & result validation)
- **Token Operations** (mint, transfer, get balances)
- **Email Notifications** (Nodemailer)
- **Mock Payment Endpoints** (Stripe & crypto)
- **Comprehensive Testing** (Jest & Supertest)

## Tech Stack
- **Node.js** / **Express**
- **MongoDB** / **Mongoose**
- **Ethers.js** (Ethereum interactions)
- **Nodemailer** (emails)
- **Jest** / **Supertest** (testing)

## Setup
1. **Install dependencies**:  
   ```bash
   npm install
   ```
2. **Configure environment** (create `.env`):
   ```
   MONGO_URI=...
   JWT_SECRET=...
   ```
3. **Run development**:  
   ```bash
   npm run dev
   ```
4. **Run tests**:  
   ```bash
   npm test
   ```

## Project Structure (High-Level)
- **config/**: DB connection
- **controllers/**: Request handling logic
- **middleware/**: Auth & role checks
- **models/**: Mongoose schemas
- **routes/**: Express endpoints
- **services/**: Core logic (blockchain, Lichess, emails)
- **tests/**: Comprehensive test suites
- **server.js**: Main Express app

---

Feel free to customize or extend this README based on your deployment needs.
