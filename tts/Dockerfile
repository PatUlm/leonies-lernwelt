# Piper text-to-speech, reachable only from the API (internal Docker network).
# The voice is baked into the image, so the container needs no internet access.
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt fetch_voice.py ./
RUN pip install --no-cache-dir --root-user-action=ignore -r requirements.txt

# British English (OpenSLR 83, CC BY-SA 4.0); pinned by checksum.
ARG VOICE_URL=https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/southern_english_female/low
RUN mkdir /voices \
 && python fetch_voice.py "${VOICE_URL}/en_GB-southern_english_female-low.onnx" \
      f2f37aed1b3a093476f719d1379ba0c0b1b1cf6f1ef99288e2ebf502971a07c3 /voices/en_GB-southern_english_female-low.onnx \
 && python fetch_voice.py "${VOICE_URL}/en_GB-southern_english_female-low.onnx.json" \
      a1af43310f8756161506e849a2863d342a98b0853af9e2437581d39e9922d0e5 /voices/en_GB-southern_english_female-low.onnx.json

COPY server.py ./
ENV PORT=5000 VOICE_DIR=/voices
USER nobody
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --start-interval=1s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/health', timeout=2)"
CMD ["python", "server.py"]
