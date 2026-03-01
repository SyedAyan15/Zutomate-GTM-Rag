'use client'

import { useState, useRef, KeyboardEvent } from 'react'
import { ArrowUp, Mic, Square } from 'lucide-react'

interface MessageInputProps {
  onSendMessage: (message: string) => void
  disabled: boolean
}

export default function MessageInput({ onSendMessage, disabled }: MessageInputProps) {
  const [message, setMessage] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() && !disabled) {
      onSendMessage(message)
      setMessage('')
    }
  }

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Use webm if supported, fallback to whatever is available
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'

      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // Stop all tracks to release the microphone
        stream.getTracks().forEach(track => track.stop())

        const audioBlob = new Blob(chunksRef.current, { type: mimeType })
        console.log(`DEBUG: Recording stopped. Blob size: ${audioBlob.size} bytes, type: ${mimeType}`)

        if (audioBlob.size === 0) {
          console.warn('DEBUG: Empty audio blob, skipping transcription')
          return
        }

        await transcribeAudio(audioBlob, mimeType)
      }

      mediaRecorder.start(250) // Collect data every 250ms
      setIsRecording(true)
      console.log('DEBUG: Recording started')

    } catch (err: any) {
      console.error('Microphone access error:', err)
      if (err.name === 'NotAllowedError') {
        alert('Microphone access was denied. Please allow microphone access in your browser settings.')
      } else {
        alert('Could not start recording. Please check your microphone.')
      }
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      console.log('DEBUG: Stop recording requested')
    }
  }

  const transcribeAudio = async (audioBlob: Blob, mimeType: string) => {
    setIsTranscribing(true)

    try {
      // Determine file extension from mime type
      const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'mp4' : 'wav'
      const formData = new FormData()
      formData.append('file', audioBlob, `recording.${ext}`)

      console.log('DEBUG: Sending audio for transcription...')

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData?.details || errorData?.error || 'Transcription failed')
      }

      const data = await response.json()

      if (data.text && data.text.trim()) {
        // Append transcribed text to current message
        setMessage(prev => prev ? `${prev} ${data.text.trim()}` : data.text.trim())
        console.log('DEBUG: Transcription complete:', data.text)
      } else {
        console.warn('DEBUG: No text in transcription response')
      }

    } catch (err: any) {
      console.error('Transcription error:', err)
      alert('Voice transcription failed: ' + err.message)
    } finally {
      setIsTranscribing(false)
    }
  }

  const isBusy = disabled || isTranscribing

  return (
    <div className="border-t border-gray-100 md:border-t-0 p-2 md:p-0 bg-white md:bg-transparent">
      <form onSubmit={handleSubmit} className="flex items-end space-x-2 max-w-4xl mx-auto">
        <div className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl focus-within:ring-2 focus-within:ring-orange-500/20 focus-within:border-orange-500 transition-all">
          <textarea
            value={isTranscribing ? 'Transcribing...' : message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={isRecording ? '🎙️ Listening...' : 'Type your message...'}
            disabled={isBusy || isRecording}
            rows={1}
            className="w-full px-4 py-3 text-sm md:text-base bg-transparent border-none focus:outline-none text-gray-900 placeholder-gray-400 resize-none min-h-[44px] max-h-32"
          />
        </div>

        {/* Mic / Stop button */}
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isBusy}
          title={isRecording ? 'Stop recording' : 'Voice input'}
          className={`p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all shadow-lg flex items-center justify-center h-[44px] w-[44px] ${isRecording
              ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
              : isTranscribing
                ? 'bg-amber-500 text-white cursor-wait'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            } disabled:opacity-30 disabled:cursor-not-allowed`}
        >
          {isRecording ? (
            <Square className="h-4 w-4" />
          ) : isTranscribing ? (
            <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Mic className="h-5 w-5" />
          )}
        </button>

        {/* Send button */}
        <button
          type="submit"
          disabled={isBusy || !message.trim() || isRecording}
          className="p-3 bg-[#0A192F] text-white rounded-xl hover:bg-[#112240] focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg flex items-center justify-center h-[44px] w-[44px]"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </form>
    </div>
  )
}
