package ru.jealfe.moyakuhnya;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KitchenFilesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
