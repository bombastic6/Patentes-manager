import mongoose from "mongoose";

const encuestaSchema = new mongoose.Schema({
  titulo: {
    type: String,
    required: true
  },
  // Guardamos el archivo PDF como datos binarios (Buffer)
  pdfArchivo: {
    type: Buffer,
    required: true
  },
  // Es una excelente práctica guardar el nombre original del archivo
  pdfNombre: {
    type: String,
    required: true
  },
  // Guardar el tipo de contenido (mime-type) ayuda al backend a enviarlo correctamente al frontend
  pdfContentType: {
    type: String,
    default: 'application/pdf'
  },
  fechaCreacion: {
    type: Date,
    default: Date.now
  }
});

const Encuesta = mongoose.model('Documento', encuestaSchema);
export default Encuesta;