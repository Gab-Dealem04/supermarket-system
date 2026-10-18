import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});

export const prisma = new PrismaClient({ adapter });

export const connectDB = async () => {
    try {
        if(!process.env.DATABASE_URL){
            throw new Error('A variável DATABASE_URL não está definida.');
        }

        await prisma.$connect();
        console.log('Conectado ao PostgreSQLcom sucesso!');
    } catch (error) {
        console.error('Erro ao conectar ao PostgreSQL:', error);
        process.exit(1);
    }
}
