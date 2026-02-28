import asyncio
from app.services.pipeline import PrivacyFirewallPipeline
from app.services.extractors import ExtractionOutput
from app.domain.models import MediaType
from app.api.dependencies import get_pipeline

async def test():
    pipeline = get_pipeline()
    
    extraction = ExtractionOutput(
        request_id="test_audio",
        media_type="audio",
        temp_file_path=None,
        text_segments=[{"page": 1, "text": "This is a test. My name is Abraham Lincoln. Let me repeat, Abraham Lincoln."}],
        bounding_boxes=[],
        faces=[],
        objects=[],
        timestamps=[
            {"start_sec": 0.0, "end_sec": 2.0, "text": "This is a test."},
            {"start_sec": 2.1, "end_sec": 4.0, "text": "My name is Abraham Lincoln."},
            {"start_sec": 4.1, "end_sec": 7.0, "text": "Let me repeat, Abraham Lincoln."}
        ]
    )
    
    audit, trace, flagged, score, warning = await pipeline._detect_and_classify(
        extraction, MediaType.AUDIO, use_llm=True
    )
    
    print(f"Risk score: {score}")
    has_abraham = [f for f in flagged if "Abraham" in f.detected.raw_value]
    print(f"Found {len(has_abraham)} instances of Abraham Lincoln.")
    for h in has_abraham:
        ref = h.detected.location_reference
        print(f"  - [{ref.start_sec}s -> {ref.end_sec}s] {h.detected.raw_value}")

asyncio.run(test())
