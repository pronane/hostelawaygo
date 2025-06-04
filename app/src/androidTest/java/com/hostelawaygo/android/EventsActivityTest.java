package com.hostelawaygo.android;

import android.support.test.rule.ActivityTestRule;
import android.support.test.runner.AndroidJUnit4; // Corrected import
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

import static android.support.test.espresso.Espresso.onView;
import static android.support.test.espresso.assertion.ViewAssertions.matches;
import static android.support.test.espresso.matcher.ViewMatchers.isDisplayed;
import static android.support.test.espresso.matcher.ViewMatchers.withId;
import static android.support.test.espresso.matcher.ViewMatchers.withText;

// Import R class from the app module
import com.hostelawaygo.android.R;

@RunWith(AndroidJUnit4.class) // Corrected class name
public class EventsActivityTest {

    @Rule
    public ActivityTestRule<EventsActivity> activityRule =
            new ActivityTestRule<>(EventsActivity.class); // Corrected class name

    @Test
    public void testUiElementsDisplayed() {
        // Check if EditText is displayed
        onView(withId(R.id.location_edit_text))
                .check(matches(isDisplayed()));

        // Check if Button is displayed
        onView(withId(R.id.search_button))
                .check(matches(isDisplayed()));

        // Check if TextView is displayed and has the correct initial text
        onView(withId(R.id.message_text_view))
                .check(matches(isDisplayed()));
        onView(withId(R.id.message_text_view))
                .check(matches(withText("Find Events near me")));
    }
}
