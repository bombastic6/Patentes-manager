import 'dotenv/config'; // Esta línea debe ser la primera de todo el archivo
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors'; 
import session from 'express-session';
import passport from 'passport';
import userRoutes from './routes/userRoutes.js';
import girosRoutes from './routes/girosRoutes.js';
import comunaRoutes from './routes/comunaRoutes.js';


const app = express();
const PORT = 3000;

// Middlewares obligatorios
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORRECCIÓN DE CORS: Configuración dinámica compatible con Live Server y Localhost directo
app.use(cors({
  origin: function (origin, callback) {
    // Permite peticiones sin origen (como archivos locales file://) o cualquier variante de localhost/127.0.0.1
    if (!origin || origin.indexOf('localhost') !== -1 || origin.indexOf('127.0.0.1') !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Bloqueado por políticas de seguridad CORS'));
    }
  },
  credentials: true // Permite el paso seguro de cookies y sesiones de Passport
}));

// Servir archivos estáticos de la carpeta public
app.use(express.static('public'));

// Configuración de Sesiones obligatoria para Google
app.use(session({
  secret: 'mi_clave_secreta_para_patentes',
  resave: false,
  saveUninitialized: false
}));

// Inicializar Passport
app.use(passport.initialize());
app.use(passport.session());

// Vincular las rutas de la API
app.use('/api/users', userRoutes);
app.use('/api/giros', girosRoutes);
app.use('/api/comunas', comunaRoutes);

// Conexión fija y directa a tu MongoDB Atlas
const MONGO_URI = 'mongodb://admin:Patentes2026@ac-gloprxa-shard-00-00.osz8vb9.mongodb.net:27017,ac-gloprxa-shard-00-01.osz8vb9.mongodb.net:27017,ac-gloprxa-shard-00-02.osz8vb9.mongodb.net:27017/?ssl=true&replicaSet=atlas-1jhmom-shard-0&authSource=admin&appName=Cluster0';

mongoose.connect(MONGO_URI)
  .then(() => console.log('🚀 ¡Conexión exitosa a MongoDB Atlas!'))
  .catch((error) => console.error('❌ Error al conectar a MongoDB:', error));

// Entrega el index.html buscando dentro de la carpeta 'public'
app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/public/index.html');
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor listo y corriendo en: http://localhost:${PORT}`);
});