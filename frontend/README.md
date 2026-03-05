# University Computer Monitoring System - Frontend

A modern React 18 + TypeScript + Vite application for monitoring 300+ university computers in real-time.

## Features

- **Real-time Monitoring**: WebSocket-based live updates
- **Advanced Filtering**: 20+ filter options with saved presets
- **Analytics Dashboard**: 12 charts with 30+ metrics
- **Machine Details**: Comprehensive hardware/software/network information
- **Alert Management**: Configure and manage system alerts
- **Bulk Operations**: Tag, group, and manage multiple machines
- **Timeline Events**: Historical event tracking
- **Export Capabilities**: CSV/JSON export functionality

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS v4** - Styling
- **Shadcn/ui** - UI components
- **Recharts** - Analytics charts
- **Lucide React** - Icons

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Backend URL

Edit `src/config.ts` or create a `.env` file:

```env
VITE_API_BASE_URL=http://localhost:8001
```

### 3. Start Development Server

```bash
npm run dev
```

The app will be available at **http://localhost:3000**

### 4. Build for Production

```bash
npm run build
```

Build output will be in the `dist/` directory.

## Project Structure

```
frontend/
├── src/
│   ├── components/        # React components
│   │   ├── ui/           # Reusable UI components
│   │   ├── error-boundaries/  # Error handling
│   │   └── ...           # Feature components
│   ├── contexts/         # React contexts
│   ├── hooks/            # Custom hooks
│   ├── lib/              # Utilities and helpers
│   ├── pages/            # Page components
│   ├── services/         # API services
│   ├── styles/           # Global styles
│   ├── types/            # TypeScript types
│   ├── App.tsx           # Root component
│   ├── main.tsx          # Entry point
│   └── config.ts         # Configuration
├── public/               # Static assets
├── index.html            # HTML template
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
├── vite.config.ts        # Vite config
└── tailwind.config.js    # Tailwind config
```

## Available Scripts

- `npm run dev` - Start development server (port 3000)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Environment Variables

Create a `.env` file in the root directory:

```env
# Backend API URL
VITE_API_BASE_URL=http://localhost:8001

# WebSocket URL (optional, defaults to API URL)
VITE_WS_URL=ws://localhost:8001

# Enable debug mode (optional)
VITE_DEBUG=false
```

## Development

### Adding New Components

1. Create component in `src/components/`
2. Import in parent component
3. Use TypeScript for type safety

### Styling Guidelines

- Use Tailwind CSS classes
- Follow existing color palette
- Maintain WCAG 2.1 AA compliance
- Use design tokens from `src/lib/design-tokens.ts`

### API Integration

All API calls go through `src/services/api.ts`:

```typescript
import { fetchMachines } from './services/api';

const machines = await fetchMachines({ status: 'online' });
```

## Deployment

### Static Hosting (Netlify, Vercel, etc.)

1. Build the project:
   ```bash
   npm run build
   ```

2. Deploy the `dist/` directory

3. Configure environment variables in hosting platform

### Nginx

```nginx
server {
    listen 80;
    server_name monitoring.university.edu;
    root /var/www/monitoring/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Browser Support

- Chrome/Edge 90+
- Firefox 90+
- Safari 14+

## Performance

- Lazy loading for components
- Virtual scrolling for large lists
- Optimized re-renders with React.memo
- Code splitting with React.lazy

## Accessibility

- WCAG 2.1 AA compliant
- Keyboard navigation support
- Screen reader friendly
- Focus management
- ARIA labels

## Troubleshooting

### Port 3000 already in use

```bash
# Change port in vite.config.ts
server: {
  port: 3001
}
```

### Cannot connect to backend

1. Check backend is running on port 8001
2. Verify VITE_API_BASE_URL in .env
3. Check browser console for CORS errors

### Build fails

```bash
# Clear cache and reinstall
rm -rf node_modules dist
npm install
npm run build
```

## License

Proprietary - University Computer Monitoring System

## Support

For issues or questions, contact the development team.
