package com.hostelawaygo.android;

import android.app.Activity;
import android.location.Address;
import android.location.Geocoder;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

import java.io.IOException;
import java.util.List;
import java.util.Locale;

public class EventsActivity extends Activity {

    private EditText locationEditText;
    private Button searchButton;
    private TextView messageTextView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_events);

        locationEditText = findViewById(R.id.location_edit_text);
        searchButton = findViewById(R.id.search_button);
        messageTextView = findViewById(R.id.message_text_view);
        messageTextView.setText("Find Events near me");

        searchButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String locationName = locationEditText.getText().toString();
                if (!locationName.isEmpty()) {
                    Geocoder geocoder = new Geocoder(EventsActivity.this, Locale.getDefault());
                    try {
                        List<Address> addresses = geocoder.getFromLocationName(locationName, 1);
                        if (addresses != null && !addresses.isEmpty()) {
                            Address address = addresses.get(0);
                            messageTextView.setText("Lat: " + address.getLatitude() + ", Lon: " + address.getLongitude());
                        } else {
                            messageTextView.setText("Location not found.");
                        }
                    } catch (IOException e) {
                        e.printStackTrace();
                        messageTextView.setText("Error finding location. Check network connection.");
                    }
                } else {
                    messageTextView.setText("Please enter a location.");
                }
            }
        });
    }
}
