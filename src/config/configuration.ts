// src/config/configuration.ts
export default () => ({
    port: parseInt(process.env.PORT, 10) || 3000,
    environment: process.env.NODE_ENV || 'development',
    jwt: {
        secret: process.env.JWT_SECRET,
        expiresIn: '1d',
    },
    sticky: {
        apiUrl: process.env.STICKY_API_URL,
        username: process.env.STICKY_USERNAME,
        password: process.env.STICKY_PASSWORD,
    },
});