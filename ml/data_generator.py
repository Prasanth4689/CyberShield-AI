import os
import json
import random
import uuid
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
from faker import Faker
from tqdm import tqdm

fake = Faker()

# Configuration
NUM_USERS = 150
NUM_SERVICE_ACCOUNTS = 30
NUM_EDGE_DEVICES = 20
TOTAL_ENTITIES = NUM_USERS + NUM_SERVICE_ACCOUNTS + NUM_EDGE_DEVICES
NUM_EVENTS = 50000
DAYS = 30

CITIES = [
    ("New York", "USA", 40.7128, -74.0060), ("Los Angeles", "USA", 34.0522, -118.2437),
    ("London", "UK", 51.5074, -0.1278), ("Paris", "France", 48.8566, 2.3522),
    ("Tokyo", "Japan", 35.6762, 139.6503), ("Sydney", "Australia", -33.8688, 151.2093),
    ("Berlin", "Germany", 52.5200, 13.4050), ("Toronto", "Canada", 43.6510, -79.3470),
    ("Singapore", "Singapore", 1.3521, 103.8198), ("Mumbai", "India", 19.0760, 72.8777),
    ("Dubai", "UAE", 25.2048, 55.2708), ("São Paulo", "Brazil", -23.5505, -46.6333),
    ("Seoul", "South Korea", 37.5665, 126.9780), ("Moscow", "Russia", 55.7558, 37.6173),
    ("Mexico City", "Mexico", 19.4326, -99.1332), ("Beijing", "China", 39.9042, 116.4074),
    ("Johannesburg", "South Africa", -26.2041, 28.0473), ("Cairo", "Egypt", 30.0444, 31.2357),
    ("Buenos Aires", "Argentina", -34.6037, -58.3816), ("Istanbul", "Turkey", 41.0082, 28.9784)
]

RESOURCES = [f"res_{i}" for i in range(100)]
AUTH_METHODS = ["password", "token", "certificate", "biometric"]
COMMANDS = ["login", "read", "write", "delete", "execute", "logout", "upload", "download"]

def generate_entity_profiles():
    profiles = {}
    
    for i in range(NUM_USERS):
        entity_id = f"USR_{i:03d}"
        profiles[entity_id] = create_profile(entity_id, "user")
        
    for i in range(NUM_SERVICE_ACCOUNTS):
        entity_id = f"SVC_{i:03d}"
        profiles[entity_id] = create_profile(entity_id, "service_account")
        
    for i in range(NUM_EDGE_DEVICES):
        entity_id = f"DEV_{i:03d}"
        profiles[entity_id] = create_profile(entity_id, "edge_device")
        
    return profiles

def create_profile(entity_id, entity_type):
    # Base attributes based on type
    if entity_type == "user":
        pref_hours = list(range(8, 18))  # 8 AM to 6 PM
        avg_session = 3600
        auth_methods = ["password", "token", "biometric"]
        num_res = random.randint(3, 8)
        cmds = ["login", "read", "write", "logout"]
    elif entity_type == "service_account":
        pref_hours = list(range(0, 24))  # Any time
        avg_session = 100
        auth_methods = ["certificate", "token"]
        num_res = random.randint(5, 15)
        cmds = ["login", "execute", "read", "write"]
    else:  # edge_device
        pref_hours = list(range(0, 24))
        avg_session = 86400  # Long running
        auth_methods = ["certificate"]
        num_res = random.randint(1, 3)
        cmds = ["login", "upload", "download"]

    city = random.choice(CITIES)
    return {
        "entity_type": entity_type,
        "pref_hours": pref_hours,
        "pref_locations": [city],
        "typical_resources": random.sample(RESOURCES, num_res),
        "auth_method": random.choice(auth_methods),
        "avg_session": avg_session,
        "typical_commands": cmds,
        "primary_ip": fake.ipv4(),
        "device_fingerprint": f"{fake.windows_platform_token()}|{fake.mac_address()}" if entity_type != "edge_device" else f"IoT|{fake.mac_address()}"
    }

def generate_normal_event(timestamp, entity_id, profile):
    city = random.choice(profile["pref_locations"])
    session_duration = max(1, int(np.random.normal(profile["avg_session"], profile["avg_session"] * 0.2)))
    status = "success" if random.random() > 0.05 else "failure"
    
    # 5% chance of noise (different resource, different IP, etc.)
    is_noise = random.random() < 0.05
    ip = fake.ipv4() if is_noise else profile["primary_ip"]
    res = random.choice(RESOURCES) if is_noise else random.choice(profile["typical_resources"])
    
    num_cmds = random.randint(1, 4)
    seq = ",".join(random.choices(profile["typical_commands"], k=num_cmds))
    
    return {
        "entity_id": entity_id,
        "entity_type": profile["entity_type"],
        "timestamp": timestamp,
        "source_ip": ip,
        "geo_location": city[0],
        "lat": city[2],
        "lon": city[3],
        "resource_accessed": res,
        "auth_method": profile["auth_method"],
        "session_duration": session_duration,
        "action_status": status,
        "command_sequence": seq,
        "device_fingerprint": profile["device_fingerprint"],
        "label": "normal"
    }

def generate_anomalies(base_events, profiles, start_time, end_time):
    anomaly_events = []
    
    total_anomalies = int(NUM_EVENTS * 0.03)
    anomaly_types = [
        "brute_force", "impossible_travel", "credential_stuffing", 
        "lateral_movement", "device_spoofing", "low_and_slow_exfiltration", "insider_drift"
    ]
    
    for _ in tqdm(range(total_anomalies), desc="Generating anomalies"):
        a_type = random.choice(anomaly_types)
        entity_id = random.choice(list(profiles.keys()))
        prof = profiles[entity_id]
        ts = start_time + timedelta(seconds=random.randint(0, int((end_time - start_time).total_seconds())))
        
        if a_type == "brute_force":
            ip = fake.ipv4()
            for _ in range(random.randint(5, 20)):
                evt = generate_normal_event(ts, entity_id, prof)
                evt.update({"source_ip": ip, "action_status": "failure", "label": a_type})
                anomaly_events.append(evt)
                ts += timedelta(seconds=random.randint(1, 10))
                
        elif a_type == "impossible_travel":
            evt1 = generate_normal_event(ts, entity_id, prof)
            city1 = CITIES[0]
            evt1.update({"geo_location": city1[0], "lat": city1[2], "lon": city1[3], "label": a_type})
            
            ts2 = ts + timedelta(minutes=random.randint(5, 25))
            evt2 = generate_normal_event(ts2, entity_id, prof)
            city2 = CITIES[4] # Tokyo (distant from NY)
            evt2.update({"geo_location": city2[0], "lat": city2[2], "lon": city2[3], "label": a_type, "source_ip": fake.ipv4()})
            
            anomaly_events.extend([evt1, evt2])
            
        elif a_type == "credential_stuffing":
            ip = fake.ipv4()
            for _ in range(10):
                e_id = random.choice(list(profiles.keys()))
                p = profiles[e_id]
                evt = generate_normal_event(ts, e_id, p)
                evt.update({"source_ip": ip, "action_status": "failure", "label": a_type})
                anomaly_events.append(evt)
                ts += timedelta(seconds=random.randint(1, 5))
                
        elif a_type == "lateral_movement":
            for _ in range(random.randint(10, 20)):
                evt = generate_normal_event(ts, entity_id, prof)
                evt.update({"resource_accessed": random.choice(RESOURCES), "label": a_type, "action_status": "success"})
                anomaly_events.append(evt)
                ts += timedelta(seconds=random.randint(10, 60))
                
        elif a_type == "device_spoofing":
            evt = generate_normal_event(ts, entity_id, prof)
            evt.update({"device_fingerprint": f"SpoofedOS|{fake.mac_address()}", "label": a_type})
            anomaly_events.append(evt)
            
        elif a_type == "low_and_slow_exfiltration":
            for _ in range(random.randint(5, 14)):
                evt = generate_normal_event(ts, entity_id, prof)
                evt.update({"session_duration": random.randint(10, 50), "label": a_type, "command_sequence": "download,logout"})
                anomaly_events.append(evt)
                ts += timedelta(days=1, hours=random.randint(-2, 2))
                
        elif a_type == "insider_drift":
            evt = generate_normal_event(ts, entity_id, prof)
            evt.update({"resource_accessed": random.choice(RESOURCES), "auth_method": random.choice(AUTH_METHODS), "label": a_type})
            anomaly_events.append(evt)

    return anomaly_events

def main():
    os.makedirs(r"c:\Users\bhanu\OneDrive\Desktop\Honeywell\datasets\generated", exist_ok=True)
    
    print("Generating profiles...")
    profiles = generate_entity_profiles()
    
    with open(r"c:\Users\bhanu\OneDrive\Desktop\Honeywell\datasets\generated\entity_profiles.json", "w") as f:
        json.dump(profiles, f, indent=4)
        
    start_time = datetime.now() - timedelta(days=DAYS)
    end_time = datetime.now()
    
    print("Generating normal events...")
    events = []
    normal_count = int(NUM_EVENTS * 0.97)
    
    for _ in tqdm(range(normal_count)):
        entity_id = random.choice(list(profiles.keys()))
        prof = profiles[entity_id]
        
        # Pick a time favoring pref_hours
        ts = start_time + timedelta(seconds=random.randint(0, int((end_time - start_time).total_seconds())))
        if random.random() < 0.8:
            hour = random.choice(prof["pref_hours"])
            ts = ts.replace(hour=hour)
            
        events.append(generate_normal_event(ts, entity_id, prof))
        
    anomaly_events = generate_anomalies(events, profiles, start_time, end_time)
    events.extend(anomaly_events)
    
    df = pd.DataFrame(events)
    df.sort_values(by="timestamp", inplace=True)
    df.reset_index(drop=True, inplace=True)
    
    df.to_csv(r"c:\Users\bhanu\OneDrive\Desktop\Honeywell\datasets\generated\access_logs.csv", index=False)
    print(f"Generated {len(df)} events.")

if __name__ == '__main__':
    main()
