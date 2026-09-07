# SwimCoach - Project Setup and Configuration

This document outlines the project structure and key configuration points for the SwimCoach application.

## Overview

SwimCoach is a personalized swimming training coach that aggregates scientific training knowledge to develop customized workouts for pool and gym sessions. It features an AI coach for conversational interaction and generates personalized training plans.

## Project Structure

The SwimCoach application is organized with clear separation of concerns:

### Main Project Directory (`SwimCoach/`)
- `docs/` - Project documentation
- `tasks/` - Task tracking and project management
- `README.md` - This documentation

### Application Code (`SwimCoach/SwimCoach-project/`)
The main application code is located in the `SwimCoach-project/` subdirectory. This directory contains all application-specific files:

#### Core Application Files
- `index.js` - Main Express server entry point
- `package.json` - Project dependencies and scripts
- `src/` - Source code organized by domain
- `public/` - Static frontend assets
- `.env.example` - Environment variables template
- `.env.development` - Development environment config
- `.env.staging` - Staging environment config
- `.env.production` - Production environment config
- `.gitignore` - Git ignore patterns

#### Source Code Organization (`src/`)
The source code is organized by domain with clear separation of concerns:

- **`src/routes/api/`** - HTTP API endpoints
- **`src/services/`** - Business logic and external integrations
- **`src/middleware/`** - Express middleware
- **`src/auth/`** - Authentication configuration
- **`src/models/`** - Database models
- **`src/utils/`** - Utility functions

## Key Configuration Files

### Environment Variables

Create a `.env` file in the `SwimCoach-project/` directory with the following:

```env
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/swimcoach

# Session Secret
SESSION_SECRET=your-secret-key-here

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Telegram Bot
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_WEBHOOK_SECRET=your-webhook-secret
TELEGRAM_BOT_USERNAME=your_bot_username

# Frontend URL
FRONTEND_URL=http://localhost:3000

# PostHog
POSTHOG_PROJECT_KEY=your-posthog-key
POSTHOG_HOST=https://us.i.posthog.com

# Node Environment
NODE_ENV=development
```

### Package.json Scripts

The `SwimCoach-project/package.json` contains application-specific scripts for environment management:

```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "node src/index.js",
    "dev:watch": "nodemon src/index.js",
    "start:dev": "cp .env.development .env && npm start",
    "start:staging": "cp .env.staging .env && npm start",
    "start:production": "cp .env.production .env && npm start",
    "env:dev": "echo 'Switching to development environment' && cp .env.development .env",
    "env:staging": "echo 'Switching to staging environment' && cp .env.staging .env",
    "env:production": "echo 'Switching to production environment' && cp .env.production .env",
    "test": "jest",
    "build": "webpack --mode production"
  }
}
```

## Running the Application

### Development

```bash
1. Navigate to the SwimCoach-project directory:
   cd /path/to/SwimCoach/SwimCoach-project

2. Install dependencies:
   npm install

3. Create .env file with required environment variables

4. Run the application:
   npm run start:dev
```

### Staging Environment

```bash
1. Navigate to the SwimCoach-project directory:
   cd /path/to/SwimCoach/SwimCoach-project

2. Switch to staging environment and run:
   npm run start:staging
```

### Production Environment

```bash
1. Navigate to the SwimCoach-project directory:
   cd /path/to/SwimCoach/SwimCoach-project

2. Switch to production environment and run:
   npm run start:production
```

## Key Features

### Authentication

- Google OAuth 2.0 for user login
- Session-based authentication
- Protected API routes for authenticated users only

### Telegram Integration

- Telegram bot for workout generation and coaching
- Account linking via secure tokens
- Webhook-based communication for real-time updates

### API Endpoints

- `/api/auth/google` - Google OAuth initiation
- `/api/auth/google/callback` - OAuth callback
- `/api/auth/logout` - User logout
- `/api/auth/me` - Get current user
- `/api/telegram` - Telegram webhook endpoint
- `/api/profiles/*` - Profile management
- `/api/workouts/*` - Workout management
- `/api/coach/*` - Coach conversation endpoints

### Frontend

- Hash-based routing for client-side navigation
- React-like component system (built with vanilla JavaScript)
- Real-time updates via WebSocket connections
- Responsive design for mobile and desktop

## Development Notes

### Code Organization

The application code in `SwimCoach-project/` is organized by domain with clear separation of concerns:

- **Frontend (public/JS)**: Handles UI rendering and client-side logic
- **Backend (src/routes/api)**: RESTful API endpoints
- **Services (src/services)**: Business logic and external integrations
- **Database (src/models)**: Mongoose schemas and models
- **Middleware (src/middleware)**: Request handling and validation

### Security Considerations

1. **Session Security**: Session cookies are HTTP-only and secure in production
2. **Input Validation**: All API endpoints validate and sanitize input
3. **Rate Limiting**: Consider implementing rate limiting on authentication endpoints
4. **CORS Configuration**: Restrict origins to trusted domains in production

### Performance Optimizations

1. **Database Caching**: Implement caching for frequently accessed data
2. **Static Asset Optimization**: Use appropriate cache headers for static files
3. **Compression**: Enable gzip compression for API responses
4. **Database Indexing**: Ensure proper indexes on frequently queried fields

## Troubleshooting

### Common Issues

#### Authentication Failed

Check that your `.env` file contains valid Google OAuth credentials and that the redirect URI matches your application domain.

#### Telegram Bot Errors

Ensure the TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET are correctly configured. The bot uses webhook mode for real-time updates.

#### Database Connection Issues

Verify that MongoDB is running and that the MONGODB_URI in your `.env` file is correct. Check for firewall restrictions if connecting to a remote database.

#### Frontend Not Loading

Check browser console for JavaScript errors. Ensure the API base URL is correct in the frontend configuration.

## Deployment

### Environment Variables for Production

Set these environment variables in your deployment platform for the `SwimCoach-project/`:

```bash
PORT=10000
NODE_ENV=production
MONGODB_URI=your-mongodb-uri
SESSION_SECRET=strong-secret-key
GOOGLE_CLIENT_ID=your-google-id
GOOGLE_CLIENT_SECRET=your-google-secret
TELEGRAM_BOT_TOKEN=your-telegram-token
TELEGRAM_WEBHOOK_SECRET=your-webhook-secret
TELEGRAM_BOT_USERNAME=your_bot
FRONTEND_URL=https://your-frontend-domain.com
POSTHOG_PROJECT_KEY=your-posthog-key
POSTHOG_HOST=https://us.i.posthog.com
```

### Health Checks

The application provides a `/health` endpoint for monitoring:

```bash
curl http://your-server:port/health
```

Expected response:

```json
{
  "status": "ok",
  "uptime": 12345,
  "db": "connected",
  "timestamp": "2026-09-03T12:00:00.000Z",
  "version": "1.0.0"
}
```

## Future Enhancements

1. **Real-time Features**: Implement WebSocket for live coaching conversations
2. **Mobile App**: Consider building a native mobile app for on-the-go training
3. **Advanced Analytics**: Add performance tracking and progress visualization
4. **Integration Features**: Connect with wearable devices for heart rate and GPS data
5. **Multi-language Support**: Add internationalization support for global users

## Support

For issues or questions, check the project documentation in the `docs/` directory or contact the development team.