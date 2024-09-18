const express = require('express');
const os = require('os');
const axios = require('axios'); // Remplacement par axios
const genai = require('google.generativeai'); // Assurez-vous d'avoir installé la bonne bibliothèque
const fs = require('fs');
const tempfile = require('tempfile');
const app = express();

app.use(express.json());

// Configurer l'API Gemini avec votre clé API
genai.configure({ api_key: process.env["GEMINI_API_KEY"] });

// Dictionnaire pour stocker les historiques de conversation
const sessions = {};

// Configuration du modèle avec les paramètres de génération
const generation_config = {
    temperature: 1,
    top_p: 0.95,
    top_k: 64,
    max_output_tokens: 8192,
    response_mime_type: "text/plain"
};

const model = new genai.GenerativeModel({
    model_name: "gemini-1.5-flash",
    generation_config: generation_config
});

// Fonction pour télécharger une image depuis une URL
async function download_image(url) {
    try {
        const response = await axios.get(url, { responseType: 'stream' });
        if (response.status === 200) {
            const tempFile = tempfile('.jpg');
            const writer = fs.createWriteStream(tempFile);
            response.data.pipe(writer);
            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(tempFile));
                writer.on('error', reject);
            });
        } else {
            return null;
        }
    } catch (error) {
        console.error("Error downloading image:", error);
        return null;
    }
}

// Fonction pour télécharger un fichier sur Gemini
async function upload_to_gemini(path, mime_type = null) {
    try {
        const file = await genai.upload_file(path, { mime_type });
        return file;
    } catch (error) {
        console.error("Error uploading file to Gemini:", error);
        return null;
    }
}

// Déclaration de l'API avec exports.config et exports.initialize
exports.config = {
    name: 'gemini-chat',
    author: '',
    description: 'API pour gérer des sessions de chat avec Gemini AI',
    category: 'ai',
    usage: ['/api/gemini']
};

exports.initialize = async function ({ req, res }) {
    try {
        const { prompt, customId, link } = req.body;
        if (!prompt || !customId) {
            return res.status(400).json({ message: 'Prompt or customId missing' });
        }

        // Récupérer ou initialiser l'historique de la session
        if (!sessions[customId]) {
            sessions[customId] = [];
        }
        const history = sessions[customId];

        // Gestion des images si un lien est fourni
        if (link) {
            const imagePath = await download_image(link);
            if (imagePath) {
                const file = await upload_to_gemini(imagePath);
                if (file) {
                    history.push({
                        role: "user",
                        parts: [file, prompt]
                    });
                } else {
                    return res.status(500).json({ message: 'Failed to upload image to Gemini' });
                }
            } else {
                return res.status(500).json({ message: 'Failed to download image' });
            }
        } else {
            history.push({
                role: "user",
                parts: [prompt]
            });
        }

        // Démarrer ou continuer une session de chat avec l'historique
        const chat_session = model.start_chat({ history });
        const response = await chat_session.send_message(prompt);

        // Ajouter la réponse du modèle à l'historique
        history.push({
            role: "model",
            parts: [response.text]
        });

        // Retourner la réponse du modèle
        res.json({ message: response.text });
    } catch (error) {
        console.error("Error processing request:", error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// Initialisation du serveur Express pour la route '/api/gemini'
app.post('/api/gemini', (req, res) => {
    exports.initialize({ req, res });
});

// Lancer le serveur sur le port 5000
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
