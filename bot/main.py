import os
import time
import signal
from flask import Flask, request, jsonify
from moviepy.editor import VideoFileClip
import whisper
import openai

# Set OpenAI API key
openai.api_key = "your_openai_api_key"  # Replace with your OpenAI API key

# Load Whisper model
model = whisper.load_model("base")  # Use a model like "tiny", "base", "small", "medium", or "large"

# Directory to save transcriptions and temporary audio files
output_dir = "audio_transcriptions"
os.makedirs(output_dir, exist_ok=True)

def extract_audio_from_video(video_path, audio_path):
    """Extract audio from the video and save it as a separate file."""
    clip = VideoFileClip(video_path)
    clip.audio.write_audiofile(audio_path)
    print(f"Audio extracted and saved to {audio_path}")

def transcribe_audio(audio_path):
    """Transcribe audio using Whisper."""
    print("Transcribing audio...")
    result = model.transcribe(audio_path) 
    transcription = result["text"]
    return transcription

def analyze_caption_with_gpt(caption_text, task_content):
    """Use OpenAI GPT to analyze whether the task content is mentioned in the caption."""
    try:
        prompt = (
            f"Given the following caption: \"{caption_text}\"\n\n"
            f"You are an assistant tasked with determining if the following task content was mentioned in the caption: \"{task_content}\"\n\n"
            "Respond with only 'true' or 'false'."
        )

        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[{"role": "system", "content": prompt}],
        )
        result = response.choices[0].message.content.strip().lower()
        print(f"Result from caption analysis: {result}")
        return result == "true"
    except Exception as e:
        print(f"Error analyzing caption with GPT: {e}")
        return False

# Initialize Flask app
app = Flask(__name__)

@app.route('/resolve', methods=['POST'])
def resolve():
    """API endpoint to process video and analyze captions with GPT."""
    if 'file' not in request.files or 'query' not in request.form:
        return jsonify({"error": "File and query are required"}), 400

    file = request.files['file']
    query = request.form['query']

    if not file or not query:
        return jsonify({"error": "Invalid input"}), 400

    # Save the uploaded video file temporarily
    video_path = os.path.join(output_dir, file.filename)
    audio_path = os.path.join(output_dir, "temp_audio.wav")
    file.save(video_path)

    try:
        # Extract audio from the video
        extract_audio_from_video(video_path, audio_path)

        # Transcribe the audio
        transcription = transcribe_audio(audio_path)

        # Analyze the transcription with GPT
        result = analyze_caption_with_gpt(transcription, query)

        # Cleanup temporary files
        os.remove(video_path)
        os.remove(audio_path)

        return jsonify({"query": query, "result": result})
    except Exception as e:
        print(f"Error processing request: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/')
def index():
    return "Video Processing and Analysis API is running!"

def signal_handler(sig, frame):
    """Handle SIGINT (Ctrl+C) and terminate the program gracefully."""
    print("\nCtrl+C detected! Shutting down gracefully...")
    exit(0)

def main():
    # Register the SIGINT handler
    signal.signal(signal.SIGINT, signal_handler)

    # Run the Flask server
    app.run(host='0.0.0.0', port=5000)

if __name__ == "__main__":
    main()
