from .models import Subject

# Synthetic subject of the demo erasure request. Keep identifiers consistent
# across every seeded record.
SARAH = Subject(
    full_name="Sarah Chen",
    aliases=["Sally", "Sally Chen"],
    emails=["sarah.chen@northwind-ventures.example"],
    phones=["+1-555-0142"],
    slack_handle="@sarah.chen",
    crm_contact_id="003SIM000000001",
    roles=["Berlin partnerships lead"],
)

# A different person with a near-miss name; must never be touched.
DECOY_NAME = "Sara Chen"
