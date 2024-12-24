from flask import Flask, request, jsonify
import os
import openai
import  uuid

from sqlalchemy import create_engine, Column, String, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

openai.api_key = "<open-ai-key>"

Base = declarative_base()
engine = create_engine("sqlite:///app_data.db")
Session = sessionmaker(bind=engine)
session = Session()


class TranscriptionData(Base):
    __tablename__ = "transcription_data"

    id = Column(String, primary_key=True)
    query = Column(String, nullable=False)
    transcription = Column(String, nullable=False)
    result = Column(Boolean, nullable=False)

Base.metadata.create_all(engine)

app = Flask(__name__)

upload_dir = "uploads"
os.makedirs(upload_dir, exist_ok=True)

def analyze_transcription_with_query(transcription, query):
    """Analyzes the transcription to check if the query is mentioned."""
    try:
        prompt = (
            f"Given the following transcription: \"{transcription}\"\n\n"
            f"You are an assistant tasked with determining if the following query is mentioned: \"{query}\"\n\n"
            "Respond with only 'true' or 'false'."
        )

        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[{"role": "system", "content": prompt}],
        )
        result = response.choices[0].message.content.strip().lower()
        return result == "true"
    except Exception as e:
        raise Exception(f"Error in analysis: {str(e)}")

@app.route('/')
def index():
    return "Flask server is running!"

@app.route('/process', methods=['POST'])
def process_file():
    if 'file' not in request.files or 'query' not in request.form:
        return jsonify({"error": "File and query are required"}), 400

    file = request.files['file']
    query = request.form['query']

    # Save the file locally
    file_path = os.path.join(upload_dir, file.filename)
    file.save(file_path)
    try:
        with open(file_path, "rb") as audio_file:
            response = openai.Audio.transcribe(
                model="whisper-1",
                file=audio_file
            )
        transcription = response['text']
    except Exception as e:
        return jsonify({"error": f"Error in transcription: {str(e)}"}), 500


    result=analyze_transcription_with_query(transcription=transcription, query=query)

    unique_id = str(uuid.uuid4())
    new_entry = TranscriptionData(
        id=unique_id,
        query=query,
        transcription=transcription,
        result=result
    )
    session.add(new_entry)
    session.commit()


    return jsonify({"message": query, "transcription": transcription,"result": result,"id": unique_id})


@app.route('/result/<uuid>', methods=['GET'])
def get_result(uuid):
    """Retrieve the result for a given UUID."""
    try:
        result = session.query(TranscriptionData).filter_by(id=uuid).first()
        if not result:
            return jsonify({"error": "No entry found for the given UUID."}), 404

        return jsonify({
            "id": result.id,
            "query": result.query,
            "transcription": result.transcription,
            "result": result.result
        })
    except Exception as e:
        return jsonify({"error": f"Error retrieving result: {str(e)}"}), 500

def main():
    # Run the Flask server
    app.run(host='0.0.0.0', port=8545)

if __name__ == "__main__":
    main()
