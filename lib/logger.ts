import winston from "winston";
const { combine, timestamp, json } = winston.format;

const logger = winston.createLogger({
    level: process.env.NODE_ENV == "development" ? "debug" : "warn",
    format: combine(timestamp(), json()),
    transports: [
        new winston.transports.Console({
            format: winston.format.simple(),
        })
    ],
});

export { logger };