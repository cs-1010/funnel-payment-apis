// src/config/config.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import configuration from './configuration';
import * as Joi from 'joi';

@Module({
    imports: [
        NestConfigModule.forRoot({
            isGlobal: true,
            load: [configuration],
            envFilePath: '.env',  // Make sure this points to your .env file
            expandVariables: true, // Enable environment variable expansion
            validationSchema: Joi.object({
                NODE_ENV: Joi.string()
                    .valid('development', 'production', 'test')
                    .default('development'),
                PORT: Joi.number().default(3000),
                JWT_SECRET: Joi.string().required(),
                STICKY_API_URL: Joi.string().required(),
                STICKY_USERNAME: Joi.string().required(),
                STICKY_PASSWORD: Joi.string().required(),
            }),
            validationOptions: {
                allowUnknown: true,
                abortEarly: false,
            },
        }),
    ],
})
export class ConfigModule { }