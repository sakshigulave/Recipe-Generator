const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const cors = require('cors'); // Importing CORS to handle cross-origin requests
const { 
    SpeechConfig, 
    AudioConfig, 
    SpeechRecognizer, 
    AudioOutputConfig, 
    SpeechSynthesizer 
} = require('microsoft-cognitiveservices-speech-sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(bodyParser.json());
app.use(cors()); // Enabling CORS to allow cross-origin requests

// Load JSON file (Recipes)
let recipes = [];
try {
    const rawData = fs.readFileSync('Cleaned_Indian_Food_Dataset.json');
    recipes = JSON.parse(rawData);
    console.log(`Loaded ${recipes.length} recipes from JSON file.`);
} catch (error) {
    console.error('Error loading recipes JSON file:', error);
}

// Azure Speech API Configuration
const speechConfig = SpeechConfig.fromSubscription(process.env.AZURE_SPEECH_KEY, process.env.AZURE_SPEECH_REGION);

// Endpoint: Fetch Recipe by Name
app.get('/api/recipe/:name', (req, res) => {
    const recipeName = req.params.name.toLowerCase();
    const recipe = recipes.find(r => r.TranslatedRecipeName.toLowerCase().includes(recipeName));

    if (recipe) {
        res.json({
            TranslatedRecipeName: recipe.TranslatedRecipeName,
            TranslatedIngredients: recipe.TranslatedIngredients,
            TranslatedInstructions: recipe.TranslatedInstructions,
            Cuisine: recipe.Cuisine,
            "image-url": recipe["image-url"]
        });
    } else {
        res.status(404).json({ error: 'Recipe not found.' });
    }
});

// Speech-to-Text
app.post('/api/speech-to-text', (req, res) => {
    const audioBase64 = req.body.audioBase64; // Base64 audio data sent from the frontend
    const audioConfig = AudioConfig.fromBase64EncodedAudio(audioBase64);
    const recognizer = new SpeechRecognizer(speechConfig, audioConfig);

    recognizer.recognizeOnceAsync(result => {
        if (result.reason === result.Reason.RecognizedSpeech) {
            console.log(`Recognized: ${result.text}`);
            res.json({ text: result.text });
        } else {
            console.error(`Speech recognition failed: ${result.errorDetails}`);
            res.status(500).json({ error: result.errorDetails });
        }
    });
});

// Text-to-Speech
app.post('/api/text-to-speech', (req, res) => {
    const { text, language } = req.body;
    const audioConfig = AudioOutputConfig.fromAudioFileOutput('output.wav');
    speechConfig.speechSynthesisVoiceName = `en-US-JennyNeural`;

    const synthesizer = new SpeechSynthesizer(speechConfig, audioConfig);
    synthesizer.speakTextAsync(
        text,
        result => {
            if (result.reason === result.Reason.SynthesizingAudioCompleted) {
                console.log('Text successfully synthesized to speech.');
                res.sendFile(__dirname + '/output.wav'); // Send audio file
            } else {
                console.error(`Text-to-Speech failed: ${result.errorDetails}`);
                res.status(500).json({ error: result.errorDetails });
            }
        },
        error => {
            console.error(error);
            res.status(500).json({ error: 'Error synthesizing speech.' });
        }
    );
});

// Translation
app.post('/api/translate', async (req, res) => {
    const { text, targetLanguage } = req.body;

    const endpoint = process.env.AZURE_TRANSLATOR_ENDPOINT;
    const subscriptionKey = process.env.AZURE_TRANSLATOR_KEY;
    const region = process.env.AZURE_TRANSLATOR_REGION; // Use the region for authorization
    const url = `${endpoint}/translate?api-version=3.0&to=${targetLanguage}`;

    try {
        const response = await axios.post(
            url,
            [{ Text: text }], // Ensure that the JSON format matches Azure's expected input
            {
                headers: {
                    'Ocp-Apim-Subscription-Key': subscriptionKey,
                    'Ocp-Apim-Subscription-Region': region,
                    'Content-Type': 'application/json',
                },
            }
        );

        const translatedText = response.data[0].translations[0].text;
        res.json({ translatedText });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error during translation.' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
