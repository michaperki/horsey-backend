# Horsey Backend

A comprehensive backend for a chess betting platform with Lichess integration. This service manages users, bets, and game outcomes for chess matches.

## 🎯 Features

- **Authentication & Authorization**
  - JWT-based auth for both users and admins
  - Role-based access control
  - Secure password handling with bcrypt

- **Chess Integration**
  - Full Lichess OAuth flow integration
  - Automated game creation between matched players
  - Automated game outcome validation
  - Rating class calculation based on player ratings

- **Betting System**
  - Place, accept, and cancel bets
  - Multiple currency types (token & sweepstakes)
  - Automated bet settlement based on game outcomes
  - Comprehensive bet history with filtering options

- **User Management**
  - Player profiles with statistics
  - Lichess account connection
  - Balance tracking
  - Notification system

- **Additional Features**
  - Leaderboard with ranking system
  - Notification system via Socket.io
  - Email notifications
  - Store with in-game token packages
  - Cron jobs for maintenance tasks

## 🔧 Tech Stack

- **Core**: Node.js, Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT, Bcrypt
- **Real-time**: Socket.io
- **APIs**: Lichess API integration
- **Testing**: Jest, Supertest
- **Task Scheduling**: Node-cron
- **Email**: Nodemailer

## 📂 Project Structure

```
backend/
├── config/         # Database configuration
├── controllers/    # Request handlers and business logic
├── cron/           # Scheduled tasks
├── middleware/     # Authentication & access control
├── models/         # MongoDB schemas
├── routes/         # API endpoints
├── scripts/        # Utility scripts for DB seeding/cleanup
├── services/       # Core business logic services
├── tests/          # Test suites
└── utils/          # Helper utilities
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v14+)
- MongoDB (local or Atlas)
- Lichess OAuth application credentials

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment files:
   - `.env` - Main environment
   - `.env.test` - Test environment
   - `.env.cypress` - Cypress testing

   Example `.env` content:
   ```
   MONGODB_URI=mongodb://localhost:27017/horsey
   JWT_SECRET=your_secret_key
   SESSION_SECRET=your_session_secret
   
   # Lichess OAuth
   LICHESS_CLIENT_ID=your_lichess_client_id
   LICHESS_CLIENT_SECRET=your_lichess_client_secret
   LICHESS_REDIRECT_URI=http://localhost:5000/lichess/auth/callback
   LICHESS_SCOPES=challenge:read challenge:write
   
   # Email
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_email_password
   
   # Admin
   INITIAL_ADMIN_USERNAME=admin
   INITIAL_ADMIN_EMAIL=admin@example.com
   INITIAL_ADMIN_PASSWORD=secure_password
   
   # Frontend
   FRONTEND_URL=http://localhost:3000
   ```

### Running the Server

Development:
```bash
npm run dev
```

Production:
```bash
npm start
```

Cypress Testing:
```bash
npm run dev:cypress
```

### Running Tests

```bash
npm test
```

### Seeding Data

Initialize admin user:
```bash
npm run seed-admin
```

Populate store products:
```bash
node scripts/populateStore.js
```

### Maintenance Scripts

Clean all bets:
```bash
npm run clear-bets
```

## 🔌 API Endpoints

### Authentication
- `POST /auth/register` - Register a new user
- `POST /auth/login` - User login
- `POST /auth/admin/login` - Admin login

### User
- `GET /auth/profile` - Get user profile
- `GET /user/balances` - Get user token balances

### Bets
- `POST /bets/place` - Place a new bet
- `POST /bets/accept/:betId` - Accept an existing bet
- `POST /bets/cancel/:betId` - Cancel a bet
- `GET /bets/history` - View bet history
- `GET /bets/seekers` - View available bets

### Lichess
- `GET /lichess/auth` - Initiate Lichess OAuth
- `GET /lichess/status` - Check Lichess connection status
- `GET /lichess/user` - Get connected Lichess user info
- `POST /lichess/disconnect` - Disconnect Lichess account

### Other
- `GET /leaderboard` - View the player leaderboard
- `GET /notifications` - Get user notifications
- `GET /store/products` - View store products

## 📝 Environment Variables

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | Main MongoDB connection URI |
| `MONGODB_URI_TEST` | Test MongoDB connection URI |
| `JWT_SECRET` | Secret key for JWT signing |
| `SESSION_SECRET` | Secret for Express sessions |
| `LICHESS_CLIENT_ID` | Lichess OAuth client ID |
| `LICHESS_CLIENT_SECRET` | Lichess OAuth client secret |
| `LICHESS_REDIRECT_URI` | OAuth callback URL |
| `LICHESS_SCOPES` | OAuth permission scopes |
| `EMAIL_USER` | Email username for notifications |
| `EMAIL_PASS` | Email password |
| `INITIAL_ADMIN_USERNAME` | Initial admin username |
| `INITIAL_ADMIN_EMAIL` | Initial admin email |
| `INITIAL_ADMIN_PASSWORD` | Initial admin password |
| `FRONTEND_URL` | URL of the frontend app |

## 📊 Data Models

### User
- Authentication details
- Balances (tokens & sweepstakes)
- Lichess connection & ratings
- Notification preferences

### Bet
- Creator and opponent
- Bet amount and currency type
- Game details (ID, status, result)
- Time controls & color preferences

### Other Models
- Notification
- Product
- Purchase

## 🛡 Testing

The project includes comprehensive test coverage using Jest and Supertest:

- Unit tests for services
- Integration tests for controllers
- API endpoint tests

Run tests with:
```bash
npm test
```

## 📄 License

[MIT License](LICENSE)