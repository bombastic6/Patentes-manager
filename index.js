import 'dotenv/config'; 
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

// --- CONFIGURACIÓN VITAL PARA RENDER (HTTPS) ---
// Render usa un proxy, esto permite que Express reconozca las cookies seguras
app.set('trust proxy', 1);

// Middlewares obligatorios
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORRECCIÓN DE CORS: Configuración segura para permitir Render y Localhost
app.use(cors({
  origin: function (origin, callback) {
    const dominiosPermitidos = [
      'https://tupatente-backend.onrender.com', 
      'http://localhost:3000', 
      'http://127.0.0.1:3000'
    ];
    if (!origin || dominiosPermitidos.indexOf(origin) !== -1 || origin.indexOf('localhost') !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Bloqueado por políticas de seguridad CORS'));
    }
  },
  credentials: true // Vital para permitir el envío de cookies de sesión
}));

// Servir archivos estáticos de la carpeta public
app.use(express.static('public'));

// Configuración de Sesiones con seguridad para producción (HTTPS)
app.use(session({
  secret: 'mi_clave_secreta_para_patentes',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,        // Obligatorio para HTTPS (Render)
    httpOnly: true,      // Seguridad adicional
    sameSite: 'none',    // Vital para que la cookie sea aceptada en Render
    maxAge: 24 * 60 * 60 * 1000 // 24 horas de duración
  }
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