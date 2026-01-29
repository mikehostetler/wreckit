defmodule Cybernetic.Integrations.Streaming.TwitterSpaces do
  @moduledoc """
  Twitter Spaces integration for live audio capture and processing.

  Provides real-time audio capture from Twitter Spaces, speaker diarization,
  and transcript streaming for integration with Cybernetic's event system.

  ## Features

  - **Space Discovery**: Find and monitor Twitter Spaces
  - **Audio Capture**: Connect to Space audio streams
  - **Speaker Diarization**: Identify and label different speakers
  - **Transcript Streaming**: Real-time transcription with speaker labels
  - **Event Integration**: Broadcast events to Cybernetic PubSub

  ## Architecture

  ```
  Twitter API ──► Space Monitor ──► Audio Capture ──► Diarization ──► Transcript
                        │                                   │             │
                        └── Space Events ──────────────────┴─────────────┘
  ```

  ## Usage

      # Start monitoring a Space
      {:ok, pid} = TwitterSpaces.start_link(
        tenant_id: "tenant_123",
        space_id: "1234567890"
      )

      # Subscribe to Space events
      TwitterSpaces.subscribe("tenant_123", "1234567890")

      # Get current speakers
      {:ok, speakers} = TwitterSpaces.get_speakers(pid)

      # Get full transcript
      {:ok, transcript} = TwitterSpaces.get_transcript(pid)
  """

  use GenServer
  require Logger

  alias Cybernetic.Integrations.Streaming.LiveStreamRelay

  @pubsub Cybernetic.PubSub
  @spaces_topic "twitter_spaces"

  # Polling interval for space status (Twitter API)
  @poll_interval_ms 30_000
  # Speaker silence threshold for diarization
  @speaker_silence_ms 2_000

  defstruct [
    :tenant_id,
    :space_id,
    :status,
    :speakers,
    :current_speaker,
    :stream_relay,
    :transcripts,
    :space_metadata,
    :stats
  ]

  # Public API

  @doc """
  Start monitoring a Twitter Space.
  """
  def start_link(opts \\ []) do
    tenant_id = Keyword.fetch!(opts, :tenant_id)
    space_id = Keyword.fetch!(opts, :space_id)
    name = Keyword.get(opts, :name, via_tuple(tenant_id, space_id))
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc """
  Stop monitoring the Space.
  """
  def stop(server) do
    GenServer.call(server, :stop)
  end

  @doc """
  Get current Space status.
  """
  def status(server) do
    GenServer.call(server, :status)
  end

  @doc """
  Get list of identified speakers.
  """
  def get_speakers(server) do
    GenServer.call(server, :get_speakers)
  end

  @doc """
  Get full transcript with speaker labels.
  """
  def get_transcript(server) do
    GenServer.call(server, :get_transcript)
  end

  @doc """
  Subscribe to Space events.
  """
  def subscribe(tenant_id, space_id \\ "*") do
    topic =
      if space_id == "*" do
        "#{@spaces_topic}:#{tenant_id}"
      else
        "#{@spaces_topic}:#{tenant_id}:#{space_id}"
      end

    Phoenix.PubSub.subscribe(@pubsub, topic)
  end

  @doc """
  Manually add speaker identification.
  """
  def identify_speaker(server, speaker_id, name) do
    GenServer.call(server, {:identify_speaker, speaker_id, name})
  end

  # GenServer callbacks

  @impl true
  def init(opts) do
    tenant_id = Keyword.fetch!(opts, :tenant_id)
    space_id = Keyword.fetch!(opts, :space_id)

    state = %__MODULE__{
      tenant_id: tenant_id,
      space_id: space_id,
      status: :initializing,
      speakers: %{},
      current_speaker: nil,
      stream_relay: nil,
      transcripts: [],
      space_metadata: nil,
      stats: %{
        speakers_detected: 0,
        transcripts_generated: 0,
        duration_seconds: 0,
        started_at: DateTime.utc_now()
      }
    }

    # Schedule initial connection
    send(self(), :connect)

    Logger.info("Twitter Spaces monitor started: #{space_id} for tenant #{tenant_id}")
    {:ok, state}
  end

  @impl true
  def handle_call(:stop, _from, state) do
    # Stop stream relay if running
    if state.stream_relay do
      LiveStreamRelay.stop_stream(state.stream_relay)
    end

    broadcast_event(state, :space_ended, %{
      duration_seconds: DateTime.diff(DateTime.utc_now(), state.stats.started_at),
      speakers: map_size(state.speakers),
      transcripts: length(state.transcripts)
    })

    {:reply, :ok, %{state | status: :stopped}}
  end

  @impl true
  def handle_call(:status, _from, state) do
    status = %{
      space_id: state.space_id,
      tenant_id: state.tenant_id,
      status: state.status,
      speakers_count: map_size(state.speakers),
      current_speaker: state.current_speaker,
      transcripts_count: length(state.transcripts),
      metadata: state.space_metadata,
      stats: state.stats
    }

    {:reply, {:ok, status}, state}
  end

  @impl true
  def handle_call(:get_speakers, _from, state) do
    speakers =
      state.speakers
      |> Enum.map(fn {id, speaker} ->
        %{
          id: id,
          name: speaker.name,
          speaking_time_seconds: speaker.speaking_time_ms / 1000,
          utterances: speaker.utterances
        }
      end)

    {:reply, {:ok, speakers}, state}
  end

  @impl true
  def handle_call(:get_transcript, _from, state) do
    transcript =
      state.transcripts
      |> Enum.reverse()
      |> Enum.map(fn entry ->
        speaker = Map.get(state.speakers, entry.speaker_id, %{name: "Unknown"})
        %{
          speaker: speaker.name,
          speaker_id: entry.speaker_id,
          text: entry.text,
          timestamp: entry.timestamp
        }
      end)

    {:reply, {:ok, transcript}, state}
  end

  @impl true
  def handle_call({:identify_speaker, speaker_id, name}, _from, state) do
    new_speakers =
      Map.update(state.speakers, speaker_id, %{name: name, speaking_time_ms: 0, utterances: 0}, fn speaker ->
        %{speaker | name: name}
      end)

    {:reply, :ok, %{state | speakers: new_speakers}}
  end

  @impl true
  def handle_info(:connect, state) do
    # Connect to Twitter Space (stub always succeeds)
    # In production, this would handle connection errors
    {:ok, metadata} = connect_to_space(state.space_id)

    # Start stream relay for audio processing
    {:ok, relay} = LiveStreamRelay.start_link(
      tenant_id: state.tenant_id,
      stream_id: "spaces_#{state.space_id}"
    )

    # Subscribe to relay events
    LiveStreamRelay.subscribe(state.tenant_id, "spaces_#{state.space_id}")

    broadcast_event(state, :space_joined, %{
      title: metadata.title,
      host: metadata.host
    })

    # Schedule status polling
    schedule_poll()

    {:noreply, %{state |
      status: :connected,
      stream_relay: relay,
      space_metadata: metadata
    }}
  end

  @impl true
  def handle_info(:poll_status, state) do
    if state.status == :connected do
      # poll_space_status is a stub that always returns {:ok, :live}
      # In production, this would handle :ended and :error cases
      {:ok, :live} = poll_space_status(state.space_id)
      schedule_poll()
      {:noreply, state}
    else
      {:noreply, state}
    end
  end

  @impl true
  def handle_info({:stream_event, event}, state) do
    # Handle events from LiveStreamRelay
    case event.type do
      :transcript ->
        handle_transcript(state, event.payload)

      _ ->
        {:noreply, state}
    end
  end

  @impl true
  def handle_info(_msg, state) do
    {:noreply, state}
  end

  # Private helpers

  defp via_tuple(tenant_id, space_id) do
    {:via, Registry, {Cybernetic.Integrations.Registry, {__MODULE__, tenant_id, space_id}}}
  end

  defp connect_to_space(_space_id) do
    # In production, this would use Twitter API to:
    # 1. Get Space metadata
    # 2. Connect to audio stream via Periscope
    # For now, return mock data
    {:ok, %{
      title: "Mock Twitter Space",
      host: "host_user",
      participant_count: 0,
      started_at: DateTime.utc_now()
    }}
  end

  defp poll_space_status(_space_id) do
    # In production, check if Space is still live via Twitter API
    {:ok, :live}
  end

  defp schedule_poll do
    Process.send_after(self(), :poll_status, @poll_interval_ms)
  end

  defp handle_transcript(state, transcript) do
    # Perform basic speaker diarization
    # In production, use audio features for proper diarization
    speaker_id = detect_speaker(state, transcript)

    # Update speaker stats
    new_speakers =
      Map.update(state.speakers, speaker_id, %{
        name: "Speaker #{map_size(state.speakers) + 1}",
        speaking_time_ms: 0,
        utterances: 1,
        last_spoke_at: DateTime.utc_now()
      }, fn speaker ->
        %{speaker |
          utterances: speaker.utterances + 1,
          last_spoke_at: DateTime.utc_now()
        }
      end)

    # Add transcript entry
    entry = %{
      id: transcript.id,
      speaker_id: speaker_id,
      text: transcript.text,
      timestamp: transcript.timestamp
    }

    new_transcripts = [entry | state.transcripts]
    new_stats = Map.update!(state.stats, :transcripts_generated, &(&1 + 1))

    # Broadcast with speaker info
    speaker = Map.get(new_speakers, speaker_id, %{name: "Unknown"})
    broadcast_event(state, :speaker_transcript, %{
      speaker_id: speaker_id,
      speaker_name: speaker.name,
      text: transcript.text,
      timestamp: transcript.timestamp
    })

    {:noreply, %{state |
      speakers: new_speakers,
      current_speaker: speaker_id,
      transcripts: new_transcripts,
      stats: new_stats
    }}
  end

  defp detect_speaker(state, _transcript) do
    # Simple speaker detection based on timing
    # In production, use audio embeddings for proper diarization
    now = DateTime.utc_now()

    # Check if current speaker is still speaking (within silence threshold)
    case state.current_speaker do
      nil ->
        # First speaker
        generate_speaker_id()

      current_id ->
        case Map.get(state.speakers, current_id) do
          nil ->
            generate_speaker_id()

          speaker ->
            silence_ms = DateTime.diff(now, speaker.last_spoke_at, :millisecond)
            if silence_ms > @speaker_silence_ms do
              # Long pause - likely new speaker
              generate_speaker_id()
            else
              # Continue with current speaker
              current_id
            end
        end
    end
  end

  defp generate_speaker_id do
    "spk_" <> Base.encode16(:crypto.strong_rand_bytes(4), case: :lower)
  end

  defp broadcast_event(state, event_type, payload) do
    event = %{
      type: event_type,
      space_id: state.space_id,
      tenant_id: state.tenant_id,
      payload: payload,
      timestamp: DateTime.utc_now()
    }

    topics = [
      "#{@spaces_topic}:#{state.tenant_id}",
      "#{@spaces_topic}:#{state.tenant_id}:#{state.space_id}"
    ]

    Enum.each(topics, fn topic ->
      try do
        Phoenix.PubSub.broadcast(@pubsub, topic, {:spaces_event, event})
      rescue
        _ -> :ok
      end
    end)
  end
end
